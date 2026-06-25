import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 큐레이션 추천 상품에 대해 "파티장이 등록되면 알려달라"고 대기 신청.
// product_key는 큐레이션 카드의 store_name(예: "[잇메이트] 소스 닭가슴살 스테이크 10팩").
// 같은 (user, product_key) 중복은 unique 제약으로 자동 무시(idempotent).

export async function POST(req: Request) {
  let me;
  try {
    me = await requireCurrentUser();
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { product_key?: string } | null;
  const productKey = body?.product_key?.trim();
  if (!productKey) {
    return NextResponse.json(
      { ok: false, error: "product_key 필수" },
      { status: 400 },
    );
  }

  const sb = getServiceClient();
  const { error } = await sb
    .from("pick_waitlist")
    .upsert(
      { user_id: me.id, product_key: productKey, notified_at: null },
      { onConflict: "user_id,product_key" },
    );
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// 대기 취소 — body { product_key }
export async function DELETE(req: Request) {
  let me;
  try {
    me = await requireCurrentUser();
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { product_key?: string } | null;
  const productKey = body?.product_key?.trim();
  if (!productKey) {
    return NextResponse.json(
      { ok: false, error: "product_key 필수" },
      { status: 400 },
    );
  }
  const sb = getServiceClient();
  const { error } = await sb
    .from("pick_waitlist")
    .delete()
    .eq("user_id", me.id)
    .eq("product_key", productKey);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
