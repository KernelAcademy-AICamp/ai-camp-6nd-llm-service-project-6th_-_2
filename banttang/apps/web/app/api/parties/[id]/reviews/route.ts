import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const reviews = (await req.json()) as Array<{
      reviewee_id: string;
      rating: "good" | "bad";
      text_review?: string;
    }>;
    if (!Array.isArray(reviews) || reviews.length === 0)
      return NextResponse.json({ error: "리뷰가 비어있음" }, { status: 400 });

    for (const r of reviews) {
      if (r.reviewee_id === me.id) continue;
      await sb.from("reviews").upsert(
        {
          party_id: params.id,
          reviewer_id: me.id,
          reviewee_id: r.reviewee_id,
          rating: r.rating,
          text_review: r.text_review ?? null,
        },
        { onConflict: "party_id,reviewer_id,reviewee_id" },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
