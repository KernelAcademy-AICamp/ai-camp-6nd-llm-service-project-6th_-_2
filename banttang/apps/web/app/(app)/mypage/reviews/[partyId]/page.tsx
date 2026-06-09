import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { ReviewDetailClient } from "@/components/ReviewDetailClient";

export const dynamic = "force-dynamic";

// 후기 작성 — 한 멤버씩 단계별 폼. 모두 작성하면 완료 요약.
export default async function ReviewDetailPage({
  params,
}: {
  params: { partyId: string };
}) {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  // 본인이 approved 멤버인지 확인 (아니면 진입 차단)
  const { data: meRow } = await sb
    .from("party_participants")
    .select("status")
    .eq("party_id", params.partyId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (!meRow || meRow.status !== "approved") notFound();

  // 다른 approved 멤버 (호스트 포함, 본인 제외)
  const { data: othersRows } = await sb
    .from("party_participants")
    .select(
      "user_id, is_host, profile:profiles!party_participants_user_id_fkey(id, nickname, level)",
    )
    .eq("party_id", params.partyId)
    .eq("status", "approved")
    .neq("user_id", me.id);

  const others = ((othersRows ?? []) as unknown as Array<{
    user_id: string;
    is_host: boolean;
    profile: { id: string; nickname: string; level: string | null } | null;
  }>).map((r) => ({
    user_id: r.user_id,
    is_host: r.is_host,
    nickname: r.profile?.nickname ?? "알 수 없음",
    level: r.profile?.level ?? null,
  }));

  // 내가 이미 쓴 리뷰
  const { data: myReviewsRows } = await sb
    .from("reviews")
    .select("reviewee_id, rating, text_review")
    .eq("party_id", params.partyId)
    .eq("reviewer_id", me.id);
  const existing = ((myReviewsRows ?? []) as Array<{
    reviewee_id: string;
    rating: "good" | "bad";
    text_review: string | null;
  }>);

  return (
    <ReviewDetailClient
      party={{ id: params.partyId }}
      others={others}
      existing={existing}
    />
  );
}
