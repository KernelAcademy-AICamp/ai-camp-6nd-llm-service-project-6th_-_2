import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { ReviewsTabs } from "@/components/ReviewsTabs";

export const dynamic = "force-dynamic";

// 띵동 후기 — 작성 후기 / 받은 후기 두 탭.
//   작성 후기: 내가 다른 멤버에게 남긴 후기 (상대 닉네임 + 평가 + 내용)
//   받은 후기: 다른 멤버가 나에게 남긴 익명 후기
export default async function ReviewsPage() {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  // 1) 작성 후기 — 내가 쓴 후기. 받은 후기와 동일한 카드로 보여준다.
  const { data: writtenRows } = await sb
    .from("reviews")
    .select(
      "id, party_id, rating, text_review, created_at, party:parties(store_name, deal_at), reviewee:profiles!reviews_reviewee_id_fkey(id, nickname)",
    )
    .eq("reviewer_id", me.id)
    .order("created_at", { ascending: false });

  const written = ((writtenRows ?? []) as Array<{
    id: string;
    party_id: string;
    rating: "good" | "bad";
    text_review: string | null;
    created_at: string;
    party: { store_name: string; deal_at: string } | null;
    reviewee: { id: string; nickname: string } | null;
  }>).map((r) => ({
    id: r.id,
    party_id: r.party_id,
    rating: r.rating,
    text_review: r.text_review,
    created_at: r.created_at,
    party: r.party,
    reviewee_nickname: r.reviewee?.nickname ?? "알 수 없음",
  }));

  // 2) 받은 후기 — reviewer 닉네임 함께 노출
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

  return <ReviewsTabs written={written} received={received} />;
}
