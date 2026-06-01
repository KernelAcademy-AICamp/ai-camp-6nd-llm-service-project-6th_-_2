"use server";

// 모집글 사진 삭제 — Server Action.
// 호스트만, recruiting 상태 파티에서만 삭제 가능.
// party_photos row + Storage object 둘 다 정리.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deletePartyPhoto(
  partyId: string,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!partyId || !storagePath) {
      return { ok: false, error: "필수 인자 누락" };
    }

    const supabase = createServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();
    const { data: party } = await admin
      .from("parties")
      .select("id, host_id, status")
      .eq("id", partyId)
      .maybeSingle();
    if (!party) return { ok: false, error: "파티를 찾을 수 없어요." };
    if (party.host_id !== auth.user.id) {
      return { ok: false, error: "호스트만 사진을 삭제할 수 있어요." };
    }
    if (
      party.status !== "recruiting" &&
      party.status !== "closed" &&
      party.status !== "in_progress"
    ) {
      return { ok: false, error: "완료/취소된 주문은 사진을 수정할 수 없어요." };
    }

    // party_photos row 먼저 삭제 (실패 시 Storage 손대지 않음)
    const { error: delErr } = await admin
      .from("party_photos")
      .delete()
      .eq("party_id", partyId)
      .eq("storage_path", storagePath);
    if (delErr) return { ok: false, error: `메타 삭제 실패: ${delErr.message}` };

    // 외부 URL(예: https://...)은 Storage 객체가 아니므로 skip.
    if (!/^https?:\/\//i.test(storagePath)) {
      const remove = await admin.storage.from("party-photos").remove([storagePath]);
      if (remove.error) {
        // row는 이미 사라졌으므로 사용자에겐 성공으로 응답, 백그라운드 로그만.
        console.error("[delete-party-photo] storage cleanup 실패:", remove.error);
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "삭제 중 오류가 발생했어요.",
    };
  }
}
