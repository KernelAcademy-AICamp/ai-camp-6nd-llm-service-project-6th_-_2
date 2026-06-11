import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { listParties } from "@/lib/queries";
import { ReviewsTabs } from "@/components/ReviewsTabs";

export const dynamic = "force-dynamic";

// 띵동 후기 — 작성 후기 / 받은 후기 두 탭.
//   작성 후기: 내가 approved 멤버인 completed 파티 (작성 가능 + 작성 완료 한 리스트)
//   받은 후기: 다른 멤버가 나에게 남긴 익명 후기
export default async function ReviewsPage() {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  // 1) 작성 후기 대상 — 내가 참여(approved)했고 완료된 파티
  const completedParties = await listParties({
    participantId: me.id,
    statuses: ["completed"],
    excludeHiddenFor: me.id,
    sort: "latest",
  });

  // 2) 내가 쓴 리뷰의 party_id Set → 카드별 reviewed 플래그
  const { data: myReviews } = await sb
    .from("reviews")
    .select("party_id")
    .eq("reviewer_id", me.id);
  const reviewedSet = new Set(
    ((myReviews ?? []) as Array<{ party_id: string }>).map((r) => r.party_id),
  );

  const writtenItems = completedParties.map((p) => ({
    id: p.id,
    store_name: p.store_name,
    representative_menu: p.representative_menu,
    deal_at: p.deal_at,
    photo_paths: (p.photo_paths ?? []) as string[],
    reviewed: reviewedSet.has(p.id),
  }));

  // 3) 받은 후기 — reviewer 닉네임 함께 노출
  const { data: receivedRows } = await sb
    .from("reviews")
    .select(
      "id, party_id, rating, text_review, created_at, party:parties(store_name, deal_at), reviewer:profiles!reviews_reviewer_id_fkey(id, nickname)",
    )
    .eq("reviewee_id", me.id)
    .order("created_at", { ascending: false });

  const received = ((receivedRows ?? []) as Array<{
    id: string;
    party_id: string;
    rating: "good" | "bad";
    text_review: string | null;
    created_at: string;
    party: { store_name: string; deal_at: string } | null;
    reviewer: { id: string; nickname: string } | null;
  }>).map((r) => ({
    id: r.id,
    party_id: r.party_id,
    rating: r.rating,
    text_review: r.text_review,
    created_at: r.created_at,
    party: r.party,
    reviewer_nickname: r.reviewer?.nickname ?? "알 수 없음",
  }));

  return <ReviewsTabs written={writtenItems} received={received} />;
}
