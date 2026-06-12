"use server";

// 채팅 이미지 업로드 — Server Action.
// 클라이언트가 직접 storage에 올리려면 RLS 정책이 필요해서, 우선 server에서
// admin 클라이언트로 업로드한다(파티 멤버십은 user_id 본인 스코프로 먼저 확인).
//
// 명세서:
//   - E803: JPG/PNG/WEBP, 10MB 이하 (HEIC은 브라우저 호환 이슈로 제외)
//   - A206: 인증 이미지와 일반 이미지를 구분(이 액션은 일반)

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface UploadChatPhotoResult {
  storage_path: string;
  public_url: string;
  width?: number | null;
  height?: number | null;
}

export async function uploadChatPhoto(
  formData: FormData,
): Promise<
  | { ok: true; data: UploadChatPhotoResult }
  | { ok: false; error: string }
> {
  try {
    const file = formData.get("file");
    const partyId = formData.get("party_id");
    const widthRaw = formData.get("width");
    const heightRaw = formData.get("height");

    if (!(file instanceof File)) {
      return { ok: false, error: "파일이 없어요." };
    }
    if (typeof partyId !== "string" || !partyId) {
      return { ok: false, error: "party_id가 없어요." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "10MB 이하의 이미지를 선택해주세요." };
    }
    if (!ALLOWED.has(file.type)) {
      return { ok: false, error: "JPG, PNG, WEBP 형식만 업로드할 수 있어요." };
    }

    // 1) 멤버십 검증
    const userId = await getAuthedUserId();
    if (!userId) {
      return { ok: false, error: "로그인이 필요해요." };
    }

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("party_participants")
      .select("id")
      .eq("party_id", partyId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!membership) {
      return { ok: false, error: "이 파티 채팅방에 업로드할 권한이 없어요." };
    }

    // 2) admin으로 업로드 (RLS 우회). 경로 = {party_id}/{uuid}.{ext}
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const storagePath = `${partyId}/${randomUUID()}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const upload = await admin.storage
      .from("chat-photos")
      .upload(storagePath, buf, {
        contentType: file.type,
        upsert: false,
      });
    if (upload.error) {
      return { ok: false, error: `업로드 실패: ${upload.error.message}` };
    }

    const { data: urlData } = admin.storage
      .from("chat-photos")
      .getPublicUrl(storagePath);

    const width = typeof widthRaw === "string" ? Number(widthRaw) || null : null;
    const height = typeof heightRaw === "string" ? Number(heightRaw) || null : null;

    return {
      ok: true,
      data: {
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        width,
        height,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "업로드 중 오류가 발생했어요.",
    };
  }
}
