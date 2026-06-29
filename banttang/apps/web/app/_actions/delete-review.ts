"use server";

// 후기 삭제 — 작성 후기/받은 후기 카드의 "삭제하기".
// 권한: 그 후기의 작성자(reviewer) 또는 대상자(reviewee)만.
// 주의: reviews에는 INSERT 신뢰점수 트리거만 있고 DELETE 트리거가 없다.
//       그래서 삭제 시 reviewee의 카운트를 직접 되돌리고 등급을 재계산한다.

import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

// compute_user_level(SQL)과 동일 기준. dandelion → tree → king
function computeLevel(tx: number, good: number, total: number): "dandelion" | "tree" | "king" {
  const ratio = total === 0 ? 0 : good / total;
  if (tx >= 10 && ratio >= 0.9) return "king";
  if (tx >= 3 && ratio >= 0.8) return "tree";
  return "dandelion";
}

export async function deleteReview(reviewId: string): Promise<Result> {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  const { data: review } = await sb
    .from("reviews")
    .select("id, reviewer_id, reviewee_id, rating, is_no_show")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return { ok: false, error: "후기를 찾을 수 없어요." };
  if (review.reviewer_id !== me.id && review.reviewee_id !== me.id) {
    return { ok: false, error: "삭제 권한이 없어요." };
  }

  // 되돌릴 대상(reviewee)의 현재 카운트 확보
  const { data: prof } = await sb
    .from("profiles")
    .select(
      "good_review_count, bad_review_count, total_review_count, no_show_count, transaction_count",
    )
    .eq("id", review.reviewee_id)
    .maybeSingle();

  const { error: delErr } = await sb.from("reviews").delete().eq("id", reviewId);
  if (delErr) return { ok: false, error: "삭제에 실패했어요." };

  // 신뢰점수 카운트 되돌리기 (음수 방지)
  if (prof) {
    const good = Math.max(0, prof.good_review_count - (review.rating === "good" ? 1 : 0));
    const bad = Math.max(0, prof.bad_review_count - (review.rating === "bad" ? 1 : 0));
    const total = Math.max(0, prof.total_review_count - 1);
    const noShow = Math.max(0, prof.no_show_count - (review.is_no_show ? 1 : 0));
    await sb
      .from("profiles")
      .update({
        good_review_count: good,
        bad_review_count: bad,
        total_review_count: total,
        no_show_count: noShow,
        level: computeLevel(prof.transaction_count, good, total),
      })
      .eq("id", review.reviewee_id);
  }

  revalidatePath("/mypage/reviews");
  return { ok: true };
}
