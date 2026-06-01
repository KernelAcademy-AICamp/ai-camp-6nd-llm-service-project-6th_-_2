import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADDRESS_COOKIE, getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { UserBar, type NotificationItem } from "@/components/UserBar";
import { BottomNav } from "@/components/BottomNav";

// 매 요청마다 SSR — BottomNav의 안 읽음 배지 / UserBar 알림 카운트가
// 라우터 캐시 때문에 옛 값을 보이지 않도록.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/");

  // 첫 진입 시 주소 설정 필요
  const address = cookies().get(ADDRESS_COOKIE)?.value;

  const sb = getServiceClient();
  const { data: notifs } = await sb
    .from("notifications")
    .select("id, title, body, link_path, is_read, created_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const notifications = (notifs ?? []) as NotificationItem[];

  // 채팅 탭 배지용 총 안 읽음 — 모든 approved 파티의 unread 합.
  const { data: unreadRows } = await sb.rpc("user_unread_counts", {
    p_user_id: me.id,
  });
  const chatUnreadTotal = ((unreadRows ?? []) as Array<{ unread_count: number }>)
    .reduce((sum, r) => sum + (r.unread_count ?? 0), 0);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-zinc-50">
      <UserBar user={me} address={address ?? null} notifications={notifications} />
      {/* flex-col로 둬서 자식 페이지(특히 채팅)가 flex-1로 가용 영역을 채우고
          input bar가 BottomNav 바로 위에 정렬되도록.
          pb-14(56px) = BottomNav 실제 높이(py-3 + icon/label + border ≈ 56px)와 일치.
          이전 pb-20은 24px 여백을 만들어 채팅 input과 BottomNav 사이에 갭이 보임. */}
      <main className="flex flex-1 flex-col pb-14">{children}</main>
      <BottomNav chatUnreadTotal={chatUnreadTotal} />
    </div>
  );
}
