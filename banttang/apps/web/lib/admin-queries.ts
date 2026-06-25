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
// 회원 — 운영자는 모든 프로필을 동네·상태 구분 없이 본다.
// ─────────────────────────────────────────────────────────────

export type AdminMemberItem = {
  id: string;
  nickname: string;
  gender: string;
  level: string;
  neighborhood_name: string | null;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  no_show_count: number;
  is_admin: boolean;
  is_beta_user: boolean;
  is_bot: boolean;
  suspended_at: string | null;
  joined_at: string;
  last_active_at: string;
};

// 모든 회원. 최근 활동순. (검색·필터·정렬은 화면에서 클라이언트 처리)
export async function listAllMembers(): Promise<AdminMemberItem[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("profiles")
    .select(
      "id, nickname, gender, level, transaction_count, good_review_count, bad_review_count, " +
        "no_show_count, is_admin, is_beta_user, is_bot, suspended_at, joined_at, last_active_at, " +
        "neighborhood:neighborhoods(name)",
    )
    .order("last_active_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    nickname: m.nickname,
    gender: m.gender,
    level: m.level,
    neighborhood_name: m.neighborhood?.name ?? null,
    transaction_count: m.transaction_count,
    good_review_count: m.good_review_count,
    bad_review_count: m.bad_review_count,
    no_show_count: m.no_show_count,
    is_admin: m.is_admin,
    is_beta_user: m.is_beta_user,
    is_bot: m.is_bot ?? false,
    suspended_at: m.suspended_at ?? null,
    joined_at: m.joined_at,
    last_active_at: m.last_active_at,
  }));
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

// ─────────────────────────────────────────────────────────────
// 신고/분쟁 — 운영자는 모든 신고를 상태 구분 없이 본다.
// reports.target_id 는 다형성 FK라 target_type 별로 라벨을 따로 해석한다.
// ─────────────────────────────────────────────────────────────

export type ReportTargetType = "party" | "user" | "message" | "review";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

// ─────────────────────────────────────────────────────────────
// 신고 케이스 — 신고자/피신고자를 모두 "당사자 카드"로 펼친 뷰.
//   피신고자(reportee)는 target_type 별로 다르게 해석한다:
//     user→대상 회원, party→호스트, message→작성자, review→피평가자
//   각 카드는 거래/좋아요/싫어요/경고/신고 5지표 + 등급·상태(정지/봇)를 담는다.
// ─────────────────────────────────────────────────────────────

export type ReportPartyCard = {
  id: string;
  nickname: string;
  level: string;
  is_bot: boolean;
  suspended: boolean;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  warning_count: number;
  report_count: number; // 이 회원이 피신고자로 걸린 신고 수(현재 적재 300건 기준)
};

export type ReportCase = {
  id: string;
  reason_code: string;
  reason_detail: string | null;
  status: ReportStatus;
  resolved_note: string | null;
  resolved_at: string | null;
  created_at: string;
  target_type: ReportTargetType;
  target_label: string;
  target_party_id: string | null; // 영수증/채팅 로그 점프용
  reporter: ReportPartyCard | null;
  reportee: ReportPartyCard | null;
  reportee_id: string | null; // 경고/제재 액션 대상
};

export async function listReportCases(): Promise<ReportCase[]> {
  const sb = getServiceClient();

  // party_id 는 20260625000002 마이그레이션 컬럼. 아직 미적용인 DB에서도
  // 500 대신 자연 degrade(버튼 숨김) 되도록, 컬럼 부재 시 축소 셀렉트로 폴백.
  const REPORT_COLS_BASE =
    "id, reporter_id, target_type, target_id, reason_code, reason_detail, status, resolved_note, resolved_at, created_at";
  let rows: any[];
  {
    const full = await sb
      .from("reports")
      .select(`${REPORT_COLS_BASE}, party_id`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (full.error) {
      const base = await sb
        .from("reports")
        .select(REPORT_COLS_BASE)
        .order("created_at", { ascending: false })
        .limit(300);
      if (base.error) throw base.error;
      rows = (base.data ?? []).map((r: any) => ({ ...r, party_id: null }));
    } else {
      rows = full.data ?? [];
    }
  }
  if (rows.length === 0) return [];

  const idsByType = (t: string) => rows.filter((r) => r.target_type === t).map((r) => r.target_id);

  // 라벨/피신고자/거래점프를 위한 배치 조회
  const [partyRes, msgRes, reviewRes] = await Promise.all([
    idsByType("party").length
      ? sb.from("parties").select("id, store_name, host_id").in("id", idsByType("party"))
      : Promise.resolve({ data: [] }),
    idsByType("message").length
      ? sb.from("chat_messages").select("id, content, sender_id, room_id").in("id", idsByType("message"))
      : Promise.resolve({ data: [] }),
    idsByType("review").length
      ? sb.from("reviews").select("id, text_review, party_id, reviewee_id").in("id", idsByType("review"))
      : Promise.resolve({ data: [] }),
  ]);

  const parties = new Map<string, { store_name: string; host_id: string }>(
    (partyRes.data ?? []).map((p: any) => [p.id, { store_name: p.store_name, host_id: p.host_id }]),
  );
  const msgs = new Map<string, { content: string; sender_id: string | null; room_id: string }>(
    (msgRes.data ?? []).map((m: any) => [m.id, { content: m.content ?? "", sender_id: m.sender_id, room_id: m.room_id }]),
  );
  const reviews = new Map<string, { text: string; party_id: string; reviewee_id: string }>(
    (reviewRes.data ?? []).map((r: any) => [r.id, { text: r.text_review ?? "", party_id: r.party_id, reviewee_id: r.reviewee_id }]),
  );

  // 메시지 → 방 → 거래(party) 매핑 (거래 점프용)
  const roomIds = [...new Set([...msgs.values()].map((m) => m.room_id).filter(Boolean))];
  const roomParty = new Map<string, string>();
  if (roomIds.length) {
    const { data: roomsData } = await sb.from("chat_rooms").select("id, party_id").in("id", roomIds);
    for (const r of (roomsData ?? []) as any[]) roomParty.set(r.id, r.party_id);
  }

  // 케이스별 라벨·피신고자·거래점프 1차 해석
  type Pre = {
    row: any;
    target_label: string;
    target_party_id: string | null;
    reportee_id: string | null;
  };
  const pre: Pre[] = rows.map((r) => {
    let target_label = "(삭제됨/알 수 없음)";
    let target_party_id: string | null = null;
    let reportee_id: string | null = null;
    switch (r.target_type) {
      case "party": {
        const p = parties.get(r.target_id);
        target_label = p?.store_name ?? "(삭제된 모집글)";
        target_party_id = p ? r.target_id : null;
        reportee_id = p?.host_id ?? null;
        break;
      }
      case "user":
        target_label = "회원 신고";
        reportee_id = r.target_id;
        break;
      case "message": {
        const m = msgs.get(r.target_id);
        target_label = m?.content ? `"${m.content.slice(0, 40)}"` : "(삭제된 메시지)";
        target_party_id = m ? roomParty.get(m.room_id) ?? null : null;
        reportee_id = m?.sender_id ?? null;
        break;
      }
      case "review": {
        const rv = reviews.get(r.target_id);
        target_label = rv?.text ? `후기 "${rv.text.slice(0, 40)}"` : "(후기)";
        target_party_id = rv?.party_id ?? null;
        reportee_id = rv?.reviewee_id ?? null;
        break;
      }
    }
    return { row: r, target_label, target_party_id, reportee_id };
  });

  // 피신고자 신고 누적 수(현재 적재 기준). 기각(dismissed)은 무고로 판단된
  // 신고라 카운트에서 제외 — 억울하게 신고당한 회원이 불이익을 받지 않게.
  const reportCount = new Map<string, number>();
  for (const p of pre) {
    if (p.reportee_id && p.row.status !== "dismissed") {
      reportCount.set(p.reportee_id, (reportCount.get(p.reportee_id) ?? 0) + 1);
    }
  }

  // 모든 당사자 프로필 카드 일괄 조회
  const userIds = [
    ...new Set(
      pre.flatMap((p) => [p.row.reporter_id, p.reportee_id]).filter((x): x is string => !!x),
    ),
  ];
  const cards = new Map<string, Omit<ReportPartyCard, "report_count">>();
  if (userIds.length) {
    // warning_count 는 20260625000001 컬럼. 미적용 DB에서도 죽지 않도록 폴백.
    const PROFILE_COLS_BASE =
      "id, nickname, level, is_bot, suspended_at, transaction_count, good_review_count, bad_review_count";
    let profs: any[] | null = null;
    const full = await sb.from("profiles").select(`${PROFILE_COLS_BASE}, warning_count`).in("id", userIds);
    if (full.error) {
      const base = await sb.from("profiles").select(PROFILE_COLS_BASE).in("id", userIds);
      profs = base.data ?? [];
    } else {
      profs = full.data ?? [];
    }
    for (const u of profs as any[]) {
      cards.set(u.id, {
        id: u.id,
        nickname: u.nickname,
        level: u.level,
        is_bot: !!u.is_bot,
        suspended: !!u.suspended_at,
        transaction_count: u.transaction_count ?? 0,
        good_review_count: u.good_review_count ?? 0,
        bad_review_count: u.bad_review_count ?? 0,
        warning_count: u.warning_count ?? 0,
      });
    }
  }

  const toCard = (uid: string | null): ReportPartyCard | null => {
    if (!uid) return null;
    const base = cards.get(uid);
    if (!base) return null;
    return { ...base, report_count: reportCount.get(uid) ?? 0 };
  };

  return pre.map((p) => ({
    id: p.row.id,
    reason_code: p.row.reason_code,
    reason_detail: p.row.reason_detail ?? null,
    status: p.row.status,
    resolved_note: p.row.resolved_note ?? null,
    resolved_at: p.row.resolved_at ?? null,
    created_at: p.row.created_at,
    target_type: p.row.target_type,
    target_label: p.target_label,
    // 신고에 직접 달린 거래(party_id)를 우선, 없으면 target_type 별로 유도한 거래
    target_party_id: p.row.party_id ?? p.target_party_id,
    reporter: toCard(p.row.reporter_id),
    reportee: toCard(p.reportee_id),
    reportee_id: p.reportee_id,
  }));
}

// 단일 모집글의 채팅 전문만(분쟁 화면 인라인 펼침용). 없으면 빈 배열.
export async function getPartyChatForAdmin(partyId: string): Promise<AdminMessage[]> {
  const sb = getServiceClient();

  const { data: room } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("party_id", partyId)
    .maybeSingle();
  if (!room?.id) return [];

  const { data: msgs } = await sb
    .from("chat_messages")
    .select("id, sender_id, type, system_event, content, created_at, profiles(nickname)")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });

  return (msgs ?? []).map((m: any) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_nickname: m.profiles?.nickname ?? null,
    type: m.type,
    system_event: m.system_event,
    content: m.content,
    created_at: m.created_at,
  }));
}
