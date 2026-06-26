import { getServiceClient } from "./supabase/admin";
import type {
  CommunityCategory,
  CommunityCommentRow,
  CommunityPostRow,
} from "./types";

// 커뮤니티 조회 모듈.
// 권한(같은 동네만)은 RLS에도 선언돼 있지만, 다른 도메인과 마찬가지로
// 서버에선 admin 클라이언트(RLS 우회)를 쓰므로 neighborhood_id 필터를 명시적으로 건다.
// 호출부는 반드시 "본인 neighborhood_id"를 넘겨야 한다.

const BUCKET = "community-photos";

function publicUrls(paths: string[] | null): string[] {
  if (!paths?.length) return [];
  const sb = getServiceClient();
  return paths.map(
    (p) => sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl,
  );
}

type AuthorRow = {
  id: string;
  nickname: string;
  level: "dandelion" | "tree" | "king";
};

/**
 * 게시글 목록.
 * - 전체글(residence 미지정): 같은 동네로 스코프.
 * - 거주지 탭(residence 지정): 건물명이 곧 "같은 주민" 식별자이므로
 *   동네와 무관하게 건물명으로 묶는다. ("에피소드 서초393"처럼 번호까지 붙은
 *   건물명은 사실상 고유 식별자라, 거주자 동네가 갈려도 같은 건물로 본다.)
 */
export async function listCommunityPosts(opts: {
  neighborhoodId: string;
  viewerId: string;
  category?: CommunityCategory;
  /** 지정 시 같은 거주지(건물) 글만. "거주지 탭"용. 동네는 무시한다. */
  residence?: string;
}): Promise<CommunityPostRow[]> {
  const sb = getServiceClient();
  let q = sb
    .from("community_posts")
    .select(
      "id, neighborhood_id, category, title, body, image_paths, like_count, comment_count, created_at, author:profiles!community_posts_author_id_fkey(id, nickname, level)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  // 거주지 탭이면 건물명으로 묶고(동네 무관), 아니면 같은 동네로 스코프.
  if (opts.residence) {
    q = q.eq("residence", opts.residence);
  } else {
    q = q.eq("neighborhood_id", opts.neighborhoodId);
  }
  if (opts.category) q = q.eq("category", opts.category);

  const { data } = await q;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const likedSet = await fetchLikedPostIds(
    opts.viewerId,
    rows.map((r) => r.id),
  );

  return rows.map((r) => toPostRow(r, likedSet.has(r.id)));
}

/** 단일 게시글 (조회자가 같은 동네가 아니면 null). */
export async function getCommunityPost(
  postId: string,
  viewerNeighborhoodId: string | null,
  viewerId: string,
): Promise<CommunityPostRow | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("community_posts")
    .select(
      "id, neighborhood_id, category, title, body, image_paths, like_count, comment_count, created_at, author:profiles!community_posts_author_id_fkey(id, nickname, level)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  // 같은 동네가 아니면 접근 불가
  if (!viewerNeighborhoodId || row.neighborhood_id !== viewerNeighborhoodId)
    return null;

  const likedSet = await fetchLikedPostIds(viewerId, [row.id]);
  return toPostRow(row, likedSet.has(row.id));
}

/** 게시글 댓글 목록 (오래된 순). */
export async function listComments(
  postId: string,
  viewerId: string,
): Promise<CommunityCommentRow[]> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("community_comments")
    .select(
      "id, post_id, parent_id, body, like_count, created_at, author:profiles!community_comments_author_id_fkey(id, nickname, level)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const { data: likes } = await sb
    .from("community_comment_likes")
    .select("comment_id")
    .eq("user_id", viewerId)
    .in(
      "comment_id",
      rows.map((r) => r.id),
    );
  const likedSet = new Set(
    ((likes ?? []) as { comment_id: string }[]).map((l) => l.comment_id),
  );

  return rows.map((r) => ({
    id: r.id,
    post_id: r.post_id,
    parent_id: r.parent_id ?? null,
    author: normalizeAuthor(r.author),
    body: r.body,
    like_count: r.like_count,
    liked_by_me: likedSet.has(r.id),
    created_at: r.created_at,
  }));
}

// ── 내부 헬퍼 ────────────────────────────────────────────────

async function fetchLikedPostIds(
  viewerId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const sb = getServiceClient();
  const { data } = await sb
    .from("community_post_likes")
    .select("post_id")
    .eq("user_id", viewerId)
    .in("post_id", postIds);
  return new Set(((data ?? []) as { post_id: string }[]).map((l) => l.post_id));
}

// Supabase 조인은 author를 객체 또는 배열로 줄 수 있어 정규화.
function normalizeAuthor(a: AuthorRow | AuthorRow[] | null) {
  const author = (Array.isArray(a) ? a[0] : a) ?? null;
  return {
    id: author?.id ?? "",
    nickname: author?.nickname ?? "(탈퇴한 이웃)",
    level: author?.level ?? "dandelion",
  };
}

function toPostRow(r: any, likedByMe: boolean): CommunityPostRow {
  return {
    id: r.id,
    neighborhood_id: r.neighborhood_id,
    author: normalizeAuthor(r.author),
    category: r.category,
    title: r.title,
    body: r.body,
    image_urls: publicUrls(r.image_paths),
    like_count: r.like_count,
    comment_count: r.comment_count,
    liked_by_me: likedByMe,
    created_at: r.created_at,
  };
}
