"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// dev 전용: 이메일 인증을 건너뛰고 즉시 사용 가능한 계정을 만든다.
// 이미 같은 이메일의 계정이 있으면 비밀번호를 갱신하고 email_confirm을 true로 맞춘다 (upsert 의미).
// admin API의 createUser({ email_confirm: true }) + updateUserById를 사용.
export type Gender = "female" | "male" | "prefer_not_to_say";

export async function createConfirmedUser(input: {
  email: string;
  password: string;
  nickname?: string | null;
  gender?: Gender;
}): Promise<{ ok: true; userId: string; reused: boolean } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();

    // 1) 신규 생성 시도
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });

    let userId: string | undefined = created.data.user?.id;
    let reused = false;

    if (created.error) {
      // 이미 존재하는 이메일인지 체크 (Supabase는 메시지/코드가 버전마다 조금씩 달라 둘 다 본다)
      const code = (created.error as { code?: string }).code;
      const msg = created.error.message?.toLowerCase() ?? "";
      const isExisting =
        code === "email_exists" ||
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("user already");

      if (!isExisting) {
        return { ok: false, error: created.error.message };
      }

      // 2) 기존 계정 찾기
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) return { ok: false, error: listErr.message };
      const found = list.users.find((u) => u.email === input.email);
      if (!found) {
        return { ok: false, error: "기존 계정을 찾지 못했어요." };
      }

      // 3) 비밀번호 갱신 + email_confirm 보장
      const updated = await admin.auth.admin.updateUserById(found.id, {
        password: input.password,
        email_confirm: true,
      });
      if (updated.error) {
        return { ok: false, error: `기존 계정 갱신 실패: ${updated.error.message}` };
      }
      userId = found.id;
      reused = true;
    }

    if (!userId) {
      return { ok: false, error: "user id missing" };
    }

    // 4) 프로필 row upsert (admin이라 RLS 우회)
    // profiles 테이블은 gender NOT NULL, nickname UNIQUE, neighborhood_id 권장.
    // nickname 충돌 시 짧은 suffix로 재시도.
    const baseNickname = (input.nickname || input.email.split("@")[0] || "user")
      .replace(/[^가-힣a-zA-Z0-9_]/g, "")
      .slice(0, 8) || "user";
    const NEIGHBORHOOD_SEED = "00000000-0000-0000-0000-000000000001";

    let nickname = baseNickname;
    let attempt = 0;
    let profErr: { code?: string; message?: string } | null = null;
    while (attempt < 5) {
      const res = await admin.from("profiles").upsert(
        {
          id: userId,
          nickname,
          gender: input.gender ?? "prefer_not_to_say",
          neighborhood_id: NEIGHBORHOOD_SEED,
        },
        { onConflict: "id" },
      );
      if (!res.error) {
        profErr = null;
        break;
      }
      profErr = res.error;
      // nickname unique 위반(23505)이면 suffix 붙여 재시도
      if (res.error.code === "23505" || /unique/i.test(res.error.message ?? "")) {
        attempt += 1;
        const suffix = Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0");
        nickname = (baseNickname + suffix).slice(0, 10);
        continue;
      }
      break;
    }
    if (profErr) {
      return {
        ok: false,
        error: `프로필 생성 실패: ${profErr.message ?? "unknown"}`,
      };
    }

    return { ok: true, userId, reused };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "계정 생성 실패",
    };
  }
}

// dev 전용: 홈 피드 확인용 모집중 샘플 파티 2개를 시드한다.
// 멱등 — 같은 UUID로 upsert하므로 여러 번 눌러도 row 수가 늘지 않음.
export async function seedSampleParties(): Promise<
  { ok: true; inserted: string[] } | { ok: false; error: string }
> {
  try {
    const admin = createAdminClient();

    const NEIGHBORHOOD_ID = "00000000-0000-0000-0000-000000000001"; // 신림동 (seed)
    const HOST_2P = "22222222-2222-2222-2222-222222222222"; // 민들레
    const HOST_3P = "33333333-3333-3333-3333-333333333333"; // 나무

    // 픽업 장소 하나 골라 그 id 사용 — 없으면 에러
    const { data: pickup, error: pickupErr } = await admin
      .from("pickup_locations")
      .select("id, name")
      .eq("neighborhood_id", NEIGHBORHOOD_ID)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pickupErr) return { ok: false, error: pickupErr.message };
    if (!pickup) {
      return {
        ok: false,
        error: "신림동에 등록된 pickup_locations이 없어요. seed.sql을 먼저 실행해주세요.",
      };
    }

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const deal2 = new Date(tomorrow.getTime() + 1 * 60 * 60 * 1000); // +1h
    const dead2 = new Date(deal2.getTime() - 60 * 60 * 1000); // deal - 1h
    const deal3 = new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000); // +3h
    const dead3 = new Date(deal3.getTime() - 60 * 60 * 1000);

    const rows = [
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        host_id: HOST_2P,
        neighborhood_id: NEIGHBORHOOD_ID,
        category: "delivery" as const,
        store_name: "맘스터치 신림점",
        representative_menu: "싸이버거 + 콜라",
        max_participants: 2,
        price_per_person: 8500,
        deal_at: deal2.toISOString(),
        apply_deadline_at: dead2.toISOString(),
        approval_type: "auto" as const,
        gender_option: "all" as const,
        pickup_location_id: pickup.id,
        paid_by_host: true,
        status: "recruiting" as const,
      },
      {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        host_id: HOST_3P,
        neighborhood_id: NEIGHBORHOOD_ID,
        category: "delivery" as const,
        store_name: "BBQ 신림점",
        representative_menu: "황금올리브 + 콜라 1.25L",
        max_participants: 3,
        price_per_person: 9000,
        deal_at: deal3.toISOString(),
        apply_deadline_at: dead3.toISOString(),
        approval_type: "auto" as const,
        gender_option: "all" as const,
        pickup_location_id: pickup.id,
        paid_by_host: true,
        status: "recruiting" as const,
      },
    ];

    const { error: insErr } = await admin
      .from("parties")
      .upsert(rows, { onConflict: "id" });
    if (insErr) return { ok: false, error: insErr.message };

    // 호스트는 party_participants에 is_host=true approved로 들어가야 (트리거 호환 + RLS)
    const hostRows = [
      {
        party_id: rows[0].id,
        user_id: HOST_2P,
        status: "approved" as const,
        is_host: true,
      },
      {
        party_id: rows[1].id,
        user_id: HOST_3P,
        status: "approved" as const,
        is_host: true,
      },
    ];
    const { error: pErr } = await admin
      .from("party_participants")
      .upsert(hostRows, { onConflict: "party_id,user_id" });
    if (pErr) return { ok: false, error: `호스트 row 생성 실패: ${pErr.message}` };

    return { ok: true, inserted: rows.map((r) => `${r.store_name} (${r.max_participants}인)`) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "시드 실패" };
  }
}

// dev 전용: 이메일로 사용자 찾아 삭제.
// auth.users + profiles + (CASCADE되는 도메인 row들)이 같이 정리된다.
export async function deleteUserByEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    // listUsers는 페이지네이션. 1000명 이하 환경 기준 1페이지로 끝.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return { ok: false, error: listErr.message };
    const found = list.users.find((u) => u.email === email);
    if (!found) return { ok: false, error: "user not found" };
    const { error: delErr } = await admin.auth.admin.deleteUser(found.id);
    if (delErr) return { ok: false, error: delErr.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "삭제 실패",
    };
  }
}
