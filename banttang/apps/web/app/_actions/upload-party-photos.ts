"use server";

// 모집글 상품 사진 업로드 — Server Action.
// 호스트만 호출 가능. 최대 10장 (party_photos.order_index 0~9, UNIQUE per party).
// 기존 사진과 중복 슬롯 없이 빈 index를 골라 채워넣는다 (재호출 안전).

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTOS = 10;

export interface UploadedPhoto {
  id: string;
  storage_path: string;
  public_url: string;
  order_index: number;
}

export async function uploadPartyPhotos(
  formData: FormData,
): Promise<
  | { ok: true; data: { photos: UploadedPhoto[] } }
  | { ok: false; error: string }
> {
  try {
    const partyId = formData.get("party_id");
    if (typeof partyId !== "string" || !partyId) {
      return { ok: false, error: "party_id가 없어요." };
    }

    const files = formData
      .getAll("files")
      .filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return { ok: false, error: "파일이 없어요." };
    }
    if (files.length > MAX_PHOTOS) {
      return {
        ok: false,
        error: `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`,
      };
    }
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        return { ok: false, error: "10MB 이하의 이미지를 선택해주세요." };
      }
      if (!ALLOWED.has(file.type)) {
        return {
          ok: false,
          error: "JPG, PNG, WEBP 형식만 업로드할 수 있어요.",
        };
      }
    }

    // 호스트 권한 검증
    const userId = await getAuthedUserId();
    if (!userId) {
      return { ok: false, error: "로그인이 필요해요." };
    }

    const admin = createAdminClient();
    const { data: party, error: partyErr } = await admin
      .from("parties")
      .select("id, host_id")
      .eq("id", partyId)
      .maybeSingle();
    if (partyErr || !party) {
      return { ok: false, error: "파티를 찾을 수 없어요." };
    }
    if (party.host_id !== userId) {
      return { ok: false, error: "호스트만 사진을 올릴 수 있어요." };
    }

    // 이미 등록된 slot 확인 → 빈 슬롯에만 채워넣기
    const { data: existing } = await admin
      .from("party_photos")
      .select("order_index")
      .eq("party_id", partyId);
    const used = new Set(
      (existing ?? []).map((r: { order_index: number }) => r.order_index),
    );
    const slots: number[] = [];
    for (let i = 0; i < MAX_PHOTOS; i++) if (!used.has(i)) slots.push(i);
    if (slots.length < files.length) {
      return {
        ok: false,
        error: `이미 ${MAX_PHOTOS}장 한도에 도달했어요.`,
      };
    }

    const photos: UploadedPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const orderIndex = slots[i];
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const storagePath = `${partyId}/${randomUUID()}.${ext}`;

      const buf = Buffer.from(await file.arrayBuffer());
      const upload = await admin.storage
        .from("party-photos")
        .upload(storagePath, buf, {
          contentType: file.type,
          upsert: false,
        });
      if (upload.error) {
        return {
          ok: false,
          error: `업로드 실패: ${upload.error.message}`,
        };
      }

      const { data: urlData } = admin.storage
        .from("party-photos")
        .getPublicUrl(storagePath);

      const { data: row, error: insErr } = await admin
        .from("party_photos")
        .insert({
          party_id: partyId,
          storage_path: storagePath,
          order_index: orderIndex,
        })
        .select("id")
        .single();
      if (insErr) {
        return {
          ok: false,
          error: `사진 메타 저장 실패: ${insErr.message}`,
        };
      }

      photos.push({
        id: row.id,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        order_index: orderIndex,
      });
    }

    return { ok: true, data: { photos } };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "업로드 중 오류가 발생했어요.",
    };
  }
}
