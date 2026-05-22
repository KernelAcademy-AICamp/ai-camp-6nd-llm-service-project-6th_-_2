import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const ids: string[] | undefined = body?.ids;

    let q = sb
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", me.id)
      .eq("is_read", false);
    if (ids?.length) q = q.in("id", ids);

    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
