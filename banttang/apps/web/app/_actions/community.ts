"use server";

// 커뮤니티(동네 게시판) 서버 액션.
// 인증/동네는 cookie 기반 getCurrentUser로 확인하고, 쓰기는 admin 클라이언트로.
// (다른 도메인과 동일 패턴 — RLS는 직접 접근 대비 2차 방어선.)
//
// 핵심 규칙: 글/댓글/좋아요는 "내 동네(neighborhood_id)" 안에서만 가능.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CommunityCategory } from "@/lib/types";

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

const VALID_CATEGORIES: CommunityCategory[] = [
  "free",
  "question",
  "share",
  "info",
  "meetup",
];

const BUCKET = "community-photos";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

// ── 글 작성 ──────────────────────────────────────────────────
export async function createCommunityPost(input: {
  category: CommunityCategory;
  title: string;
  body: string;
  imagePaths?: string[];
}): Promise<Result<{ id: string }>> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.neighborhood_id)
    return { ok: false, error: "먼저 동네를 설정해주세요." };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: "제목을 입력해주세요." };
  if (title.length > 100)
    return { ok: false, error: "제목은 100자 이하로 입력해주세요." };
  if (!body) return { ok: false, error: "내용을 입력해주세요." };
  if (body.length > 2000)
    return { ok: false, error: "내용은 2000자 이하로 입력해주세요." };
  const category = VALID_CATEGORIES.includes(input.category)
    ? input.category
    : "free";
  const imagePaths = (input.imagePaths ?? []).slice(0, 5);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("community_posts")
    .insert({
      neighborhood_id: me.neighborhood_id,
      author_id: me.id,
      category,
      title,
      body,
      image_paths: imagePaths,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/community");
  return { ok: true, data: { id: data.id as string } };
}

// ── 글 삭제 (작성자만) ───────────────────────────────────────
export async function deleteCommunityPost(
  postId: string,
): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("author_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, error: "이미 삭제된 글이에요." };
  if (post.author_id !== me.id)
    return { ok: false, error: "작성자만 삭제할 수 있어요." };

  const { error } = await admin
    .from("community_posts")
    .delete()
    .eq("id", postId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/community");
  return { ok: true };
}

// ── 댓글 작성 ────────────────────────────────────────────────
export async function createCommunityComment(input: {
  postId: string;
  body: string;
  parentId?: string | null;
}): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.neighborhood_id)
    return { ok: false, error: "먼저 동네를 설정해주세요." };

  const body = input.body.trim();
  if (!body) return { ok: false, error: "댓글을 입력해주세요." };
  if (body.length > 1000)
    return { ok: false, error: "댓글은 1000자 이하로 입력해주세요." };

  const admin = createAdminClient();
  const inSame = await postInMyNeighborhood(admin, input.postId, me.neighborhood_id);
  if (!inSame) return { ok: false, error: "우리 동네 글에만 댓글을 쓸 수 있어요." };

  // 답글 대상 검증 — 같은 글의 댓글이어야 하고, 1단계만 허용(답글의 부모는 최상위로).
  let parentId: string | null = null;
  if (input.parentId) {
    const { data: parent } = await admin
      .from("community_comments")
      .select("id, post_id, parent_id")
      .eq("id", input.parentId)
      .maybeSingle();
    if (!parent || parent.post_id !== input.postId)
      return { ok: false, error: "답글 대상을 찾을 수 없어요." };
    parentId = parent.parent_id ?? parent.id;
  }

  const { error } = await admin.from("community_comments").insert({
    post_id: input.postId,
    author_id: me.id,
    body,
    parent_id: parentId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/community/${input.postId}`);
  return { ok: true };
}

// ── 댓글 삭제 (작성자만) ─────────────────────────────────────
export async function deleteCommunityComment(
  commentId: string,
): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { data: comment } = await admin
    .from("community_comments")
    .select("author_id, post_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { ok: false, error: "이미 삭제된 댓글이에요." };
  if (comment.author_id !== me.id)
    return { ok: false, error: "작성자만 삭제할 수 있어요." };

  const { error } = await admin
    .from("community_comments")
    .delete()
    .eq("id", commentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/community/${comment.post_id}`);
  return { ok: true };
}

// ── 글 좋아요 토글 ───────────────────────────────────────────
export async function togglePostLike(
  postId: string,
): Promise<Result<{ liked: boolean }>> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.neighborhood_id)
    return { ok: false, error: "먼저 동네를 설정해주세요." };

  const admin = createAdminClient();
  const inSame = await postInMyNeighborhood(admin, postId, me.neighborhood_id);
  if (!inSame) return { ok: false, error: "우리 동네 글에만 누를 수 있어요." };

  const { data: existing } = await admin
    .from("community_post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", me.id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("community_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", me.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/community/${postId}`);
    return { ok: true, data: { liked: false } };
  }

  const { error } = await admin
    .from("community_post_likes")
    .insert({ post_id: postId, user_id: me.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/community/${postId}`);
  return { ok: true, data: { liked: true } };
}

// ── 댓글 좋아요 토글 ─────────────────────────────────────────
export async function toggleCommentLike(
  commentId: string,
): Promise<Result<{ liked: boolean }>> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.neighborhood_id)
    return { ok: false, error: "먼저 동네를 설정해주세요." };

  const admin = createAdminClient();
  const { data: comment } = await admin
    .from("community_comments")
    .select("post_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { ok: false, error: "이미 삭제된 댓글이에요." };
  const inSame = await postInMyNeighborhood(
    admin,
    comment.post_id,
    me.neighborhood_id,
  );
  if (!inSame) return { ok: false, error: "우리 동네 글에만 누를 수 있어요." };

  const { data: existing } = await admin
    .from("community_comment_likes")
    .select("comment_id")
    .eq("comment_id", commentId)
    .eq("user_id", me.id)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("community_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", me.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/community/${comment.post_id}`);
    return { ok: true, data: { liked: false } };
  }

  const { error } = await admin
    .from("community_comment_likes")
    .insert({ comment_id: commentId, user_id: me.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/community/${comment.post_id}`);
  return { ok: true, data: { liked: true } };
}

// ── 이미지 업로드 ────────────────────────────────────────────
export async function uploadCommunityPhoto(
  formData: FormData,
): Promise<Result<{ storage_path: string; public_url: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { ok: false, error: "로그인이 필요해요." };

    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "파일이 없어요." };
    if (file.size > MAX_BYTES)
      return { ok: false, error: "10MB 이하의 이미지를 선택해주세요." };
    if (!ALLOWED.has(file.type))
      return { ok: false, error: "JPG, PNG, WEBP 형식만 업로드할 수 있어요." };

    const admin = createAdminClient();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const storagePath = `${me.id}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const upload = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: file.type, upsert: false });
    if (upload.error)
      return { ok: false, error: `업로드 실패: ${upload.error.message}` };

    const { data: urlData } = admin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);
    return {
      ok: true,
      data: { storage_path: storagePath, public_url: urlData.publicUrl },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "업로드 중 오류가 발생했어요.",
    };
  }
}

// ── 내부 헬퍼 ────────────────────────────────────────────────
async function postInMyNeighborhood(
  admin: ReturnType<typeof createAdminClient>,
  postId: string,
  myNeighborhoodId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("community_posts")
    .select("neighborhood_id")
    .eq("id", postId)
    .maybeSingle();
  return !!data && data.neighborhood_id === myNeighborhoodId;
}
