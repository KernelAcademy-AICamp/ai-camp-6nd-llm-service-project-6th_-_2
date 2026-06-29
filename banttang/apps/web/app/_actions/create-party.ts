"use server";

// 파티 생성 — server action.
// RLS는 parties_insert_own + participants_insert_self로 클라이언트 INSERT도 가능하지만,
// 서버에서 묶어 처리해야 race-free + 일관된 검증/기본값 적용이 쉽다.

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

export type PartyCategory = "delivery" | "offline_shopping" | "online_shopping";

export interface CreatePartyInput {
  category: PartyCategory;
  store_name: string;
  representative_menu?: string | null;
  max_participants: number; // 2~4
  price_per_person: number;
  deal_at: string; // ISO
  pickup_location_id?: string | null;
  custom_pickup_name?: string | null;
}

const MAX_BYTE_NAME = 60;

export async function createParty(
  input: CreatePartyInput,
): Promise<{ ok: true; partyId: string } | { ok: false; error: string }> {
  try {
    // 1) 인증
    const userId = await getAuthedUserId();
    if (!userId) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();

    // 2) 입력 검증
    if (!input.store_name || input.store_name.trim().length === 0) {
      return { ok: false, error: "가게 이름을 입력해주세요." };
    }
    if (input.store_name.length > MAX_BYTE_NAME) {
      return { ok: false, error: `가게 이름은 ${MAX_BYTE_NAME}자 이하로 입력해주세요.` };
    }
    if (input.max_participants < 2 || input.max_participants > 4) {
      return { ok: false, error: "정원은 2~4명이어야 해요." };
    }
    if (!Number.isInteger(input.price_per_person) || input.price_per_person < 0) {
      return { ok: false, error: "1인당 금액을 정확히 입력해주세요." };
    }
    if (input.price_per_person > 1_000_000) {
      return { ok: false, error: "1인당 금액이 너무 커요." };
    }
    const dealMs = new Date(input.deal_at).getTime();
    if (!Number.isFinite(dealMs) || dealMs < Date.now() + 5 * 60 * 1000) {
      return { ok: false, error: "반띵 시간은 최소 5분 이후로 잡아주세요." };
    }
    if (!input.pickup_location_id && !input.custom_pickup_name) {
      return { ok: false, error: "픽업 장소를 선택해주세요." };
    }

    // 3) 프로필에서 neighborhood_id 가져오기 (스키마상 nullable이지만 parties.neighborhood_id는 NOT NULL)
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("neighborhood_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) return { ok: false, error: `프로필 조회 실패: ${profErr.message}` };
    // 모집글은 호스트가 설정한 동네에 속한다. 신림동 폴백 금지 — 없으면 온보딩을 먼저 유도.
    const neighborhoodId =
      (profile as { neighborhood_id?: string | null } | null)?.neighborhood_id ?? null;
    if (!neighborhoodId) return { ok: false, error: "동네를 먼저 설정해 주세요." };

    // 4) deadline = deal_at - 1h (deal과 가까우면 deal과 동일)
    const deadlineMs = Math.max(dealMs - 60 * 60 * 1000, Date.now());
    const deadlineIso = new Date(deadlineMs).toISOString();

    // 5) parties INSERT (admin으로 묶어서: 트리거 + 참여자 row까지 한 번에)
    const partyRow = {
      host_id: userId,
      neighborhood_id: neighborhoodId,
      category: input.category,
      store_name: input.store_name.trim(),
      representative_menu: input.representative_menu?.trim() || null,
      max_participants: input.max_participants,
      price_per_person: input.price_per_person,
      deal_at: new Date(dealMs).toISOString(),
      apply_deadline_at: deadlineIso,
      approval_type: "manual" as const, // 신정책: 파티장 수동 승인
      gender_option: "all" as const,
      pickup_location_id: input.pickup_location_id ?? null,
      custom_pickup_name: input.pickup_location_id ? null : input.custom_pickup_name ?? null,
      paid_by_host: true,
      status: "recruiting" as const,
    };

    const { data: inserted, error: insErr } = await admin
      .from("parties")
      .insert(partyRow)
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: `파티 생성 실패: ${insErr?.message ?? "unknown"}` };
    }
    const partyId = inserted.id as string;

    // 6) 호스트를 party_participants에 is_host=true approved로 등록
    const { error: pErr } = await admin
      .from("party_participants")
      .upsert(
        {
          party_id: partyId,
          user_id: userId,
          status: "approved",
          is_host: true,
          approved_at: new Date().toISOString(),
        },
        { onConflict: "party_id,user_id" },
      );
    if (pErr) {
      // 파티 생성 자체는 성공했으므로 경고 수준
      return { ok: false, error: `파티장 등록 실패: ${pErr.message}` };
    }

    return { ok: true, partyId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "파티 생성 중 오류",
    };
  }
}
