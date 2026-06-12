// 슈퍼 계정(운영자) 전용 조회 — 멤버십·성별·상태 필터를 전혀 걸지 않고
// service client로 모든 데이터를 그대로 읽는다. 페이지에서 requireAdmin()으로 게이팅한 뒤에만 호출할 것.

import { getServiceClient } from "./supabase/admin";
import { deriveDisplayStatus } from "./party-status";
import type { CommunityCategory, DisplayStatus } from "./types";

export type AdminPartyItem = {
  id: string;
  store_name: string;
  category: string;
  status: string;
  display_status: DisplayStatus;
  host_id: string;
  host_nickname: string | null;
  max_participants: number;
  occupied_count: number;
  message_count: number;
  deal_at: string;
  created_at: string;
};

// 모든 모집글(상태 무관). 최신순.
export async function listAllParties(): Promise<AdminPartyItem[]> {
  const sb = getServiceClient();

  const { data: views, error } = await sb
    .from("v_parties_with_stats")
    .select(
      "id, store_name, category, status, host_id, host_nickname, max_participants, deal_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  const base = (views ?? []) as any[];
  if (base.length === 0) return [];

  const ids = base.map((v) => v.id);

  // 참여 인원(approved+pending), 채팅방→메시지 수를 병렬 수집 (호스트 닉네임은 뷰에 이미 있음)
  const [partsRes, roomsRes] = await Promise.all([
    sb.from("party_participants").select("party_id, status").in("party_id", ids),
    sb.from("chat_rooms").select("id, party_id").in("party_id", ids),
  ]);

  const occupied = new Map<string, number>();
  for (const p of partsRes.data ?? []) {
    if (p.status === "approved" || p.status === "pending") {
      occupied.set(p.party_id, (occupied.get(p.party_id) ?? 0) + 1);
    }
  }

  // room_id ↔ party_id 매핑 후, 메시지 수를 룸 단위로 집계
  const roomToParty = new Map<string, string>();
  for (const r of roomsRes.data ?? []) roomToParty.set(r.id, r.party_id);
  const roomIds = [...roomToParty.keys()];
  const msgCount = new Map<string, number>();
  if (roomIds.length) {
    const { data: msgs } = await sb
      .from("chat_messages")
      .select("room_id")
      .in("room_id", roomIds);
    for (const m of msgs ?? []) {
      const partyId = roomToParty.get(m.room_id);
      if (partyId) msgCount.set(partyId, (msgCount.get(partyId) ?? 0) + 1);
    }
  }

  return base.map((v) => {
    const occ = occupied.get(v.id) ?? 0;
    return {
      id: v.id,
      store_name: v.store_name,
      category: v.category,
      status: v.status,
      display_status: deriveDisplayStatus(v.status, occ, v.max_participants),
      host_id: v.host_id,
      host_nickname: v.host_nickname ?? null,
      max_participants: v.max_participants,
      occupied_count: occ,
      message_count: msgCount.get(v.id) ?? 0,
      deal_at: v.deal_at,
      created_at: v.created_at,
    };
  });
}

export type AdminParticipant = {
  user_id: string;
  nickname: string | null;
  level: string | null;
  is_host: boolean;
  status: string;
};

export type AdminMessage = {
  id: string;
  sender_id: string | null;
  sender_nickname: string | null;
  type: string;
  system_event: string | null;
  content: string | null;
  created_at: string;
};

export type AdminPartyDetail = {
  party: {
    id: string;
    store_name: string;
    representative_menu: string | null;
    category: string;
    status: string;
    display_status: DisplayStatus;
    host_id: string;
    max_participants: number;
    occupied_count: number;
    price_per_person: number | null;
    deal_at: string;
    created_at: string;
  };
  participants: AdminParticipant[];
  messages: AdminMessage[];
};

// 단일 모집글 + 참여자 전원 + 채팅 전문. 없으면 null.
export async function getPartyDetailForAdmin(partyId: string): Promise<AdminPartyDetail | null> {
  const sb = getServiceClient();

  const { data: v } = await sb
    .from("v_parties_with_stats")
    .select(
      "id, store_name, representative_menu, category, status, host_id, max_participants, price_per_person, deal_at, created_at",
    )
    .eq("id", partyId)
    .maybeSingle();
  if (!v) return null;

  const { data: parts } = await sb
    .from("party_participants")
    .select("user_id, status, is_host, profiles(nickname, level)")
    .eq("party_id", partyId)
    .order("is_host", { ascending: false });

  const participants: AdminParticipant[] = (parts ?? []).map((p: any) => ({
    user_id: p.user_id,
    nickname: p.profiles?.nickname ?? null,
    level: p.profiles?.level ?? null,
    is_host: p.is_host,
    status: p.status,
  }));
  const occ = participants.filter((p) => p.status === "approved" || p.status === "pending").length;

  // 채팅방 → 메시지 전문
  const { data: room } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("party_id", partyId)
    .maybeSingle();

  let messages: AdminMessage[] = [];
  if (room?.id) {
    const { data: msgs } = await sb
      .from("chat_messages")
      .select("id, sender_id, type, system_event, content, created_at, profiles(nickname)")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true });
    messages = (msgs ?? []).map((m: any) => ({
      id: m.id,
      sender_id: m.sender_id,
      sender_nickname: m.profiles?.nickname ?? null,
      type: m.type,
      system_event: m.system_event,
      content: m.content,
      created_at: m.created_at,
    }));
  }

  return {
    party: {
      id: v.id,
      store_name: v.store_name,
      representative_menu: v.representative_menu ?? null,
      category: v.category,
      status: v.status,
      display_status: deriveDisplayStatus(v.status, occ, v.max_participants),
      host_id: v.host_id,
      max_participants: v.max_participants,
      occupied_count: occ,
      price_per_person: v.price_per_person ?? null,
      deal_at: v.deal_at,
      created_at: v.created_at,
    },
    participants,
    messages,
  };
}

// ─────────────────────────────────────────────────────────────
// 커뮤니티 — 운영자는 동네(neighborhood) 구분 없이 전체 글·댓글을 본다.
// (일반 유저는 같은 동네만, admin은 RLS 우회 + 필터 미적용)
// ─────────────────────────────────────────────────────────────

export type AdminCommunityPostItem = {
  id: string;
  category: CommunityCategory;
  title: string;
  author_nickname: string | null;
  neighborhood_name: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
};

// 모든 동네의 커뮤니티 글. 최신순.
export async function listAllCommunityPosts(): Promise<AdminCommunityPostItem[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("community_posts")
    .select(
      "id, category, title, like_count, comment_count, created_at, " +
        "author:profiles!community_posts_author_id_fkey(nickname), " +
        "neighborhood:neighborhoods(name)",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    category: p.category,
    title: p.title,
    author_nickname: p.author?.nickname ?? null,
    neighborhood_name: p.neighborhood?.name ?? null,
    like_count: p.like_count,
    comment_count: p.comment_count,
    created_at: p.created_at,
  }));
}

export type AdminCommunityComment = {
  id: string;
  parent_id: string | null;
  author_nickname: string | null;
  body: string;
  like_count: number;
  created_at: string;
};

export type AdminCommunityPostDetail = {
  post: {
    id: string;
    category: CommunityCategory;
    title: string;
    body: string;
    image_urls: string[];
    author_nickname: string | null;
    neighborhood_name: string | null;
    like_count: number;
    comment_count: number;
    created_at: string;
  };
  comments: AdminCommunityComment[];
};

// 단일 커뮤니티 글 + 댓글(답글 포함) 전문. 없으면 null.
export async function getCommunityPostDetailForAdmin(
  postId: string,
): Promise<AdminCommunityPostDetail | null> {
  const sb = getServiceClient();

  const { data: p } = await sb
    .from("community_posts")
    .select(
      "id, category, title, body, image_paths, like_count, comment_count, created_at, " +
        "author:profiles!community_posts_author_id_fkey(nickname), " +
        "neighborhood:neighborhoods(name)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!p) return null;
  const post = p as any;

  const imagePaths: string[] = post.image_paths ?? [];
  const imageUrls = imagePaths.map(
    (path) => sb.storage.from("community-photos").getPublicUrl(path).data.publicUrl,
  );

  const { data: cmts } = await sb
    .from("community_comments")
    .select(
      "id, parent_id, body, like_count, created_at, author:profiles!community_comments_author_id_fkey(nickname)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const comments: AdminCommunityComment[] = ((cmts ?? []) as any[]).map((c) => ({
    id: c.id,
    parent_id: c.parent_id,
    author_nickname: c.author?.nickname ?? null,
    body: c.body,
    like_count: c.like_count,
    created_at: c.created_at,
  }));

  return {
    post: {
      id: post.id,
      category: post.category,
      title: post.title,
      body: post.body,
      image_urls: imageUrls,
      author_nickname: post.author?.nickname ?? null,
      neighborhood_name: post.neighborhood?.name ?? null,
      like_count: post.like_count,
      comment_count: post.comment_count,
      created_at: post.created_at,
    },
    comments,
  };
}
