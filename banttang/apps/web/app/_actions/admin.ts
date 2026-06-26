"use server";

// 운영자(슈퍼 계정) 전용 서버 액션 — 모집글·커뮤니티 글 삭제.
// 반드시 requireAdmin()으로 게이팅한다. is_admin이 아니면 즉시 거부.
// 삭제는 admin 클라이언트(RLS 우회). FK는 모두 ON DELETE CASCADE라
//   - parties 삭제 → 참여자/채팅방/메시지/영수증/결제/알림 자동 정리
//   - community_posts 삭제 → 댓글/좋아요 자동 정리

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.is_admin) return { ok: false, error: "운영자만 사용할 수 있어요." };
  return { ok: true };
}

// 모집글 삭제 (연관 데이터 cascade)
export async function adminDeleteParty(partyId: string): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin.from("parties").delete().eq("id", partyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/board");
  revalidatePath("/feed");
  return { ok: true };
}

// 커뮤니티 글 삭제 (댓글/좋아요 cascade)
export async function adminDeleteCommunityPost(postId: string): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin.from("community_posts").delete().eq("id", postId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { ok: true };
}

// 커뮤니티 댓글 삭제 (답글 cascade)
export async function adminDeleteCommunityComment(commentId: string): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin.from("community_comments").delete().eq("id", commentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/community");
  return { ok: true };
}

// 성향 태그 즉시 재집계 — cron(매시) 기다리지 않고 운영자가 수동 갱신.
// refresh_user_tags()는 SECURITY DEFINER → service_role 로 rpc 호출.
export async function adminRefreshUserTags(): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { error } = await admin.rpc("refresh_user_tags");
  if (error) {
    console.error("[adminRefreshUserTags] rpc error:", error);
    return { ok: false, error: error.message ?? "집계 실패" };
  }

  revalidatePath("/admin/tags");
  return { ok: true };
}
