import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

async function getRoomId(sb: any, partyId: string) {
  const { data } = await sb.from("chat_rooms").select("id").eq("party_id", partyId).maybeSingle();
  return data?.id as string | undefined;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCurrentUser();
    const sb = getServiceClient();
    const roomId = await getRoomId(sb, params.id);
    if (!roomId) return NextResponse.json({ messages: [] });

    const { data } = await sb
      .from("chat_messages")
      .select("id, room_id, sender_id, type, system_event, content, metadata, created_at, profiles(nickname)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    return NextResponse.json({
      messages: (data ?? []).map((m: any) => ({
        ...m,
        sender_nickname: m.profiles?.nickname ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const body = (await req.json()) as { content: string };
    if (!body.content?.trim()) return NextResponse.json({ error: "내용 필요" }, { status: 400 });
    const roomId = await getRoomId(sb, params.id);
    if (!roomId) return NextResponse.json({ error: "채팅방 없음" }, { status: 404 });

    const { error } = await sb.from("chat_messages").insert({
      room_id: roomId,
      sender_id: me.id,
      type: "text",
      content: body.content.trim(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
