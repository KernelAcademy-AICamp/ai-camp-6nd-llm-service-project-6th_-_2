import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADDRESS_COOKIE, getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { UserBar, type NotificationItem } from "@/components/UserBar";
import { BottomNav } from "@/components/BottomNav";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-zinc-50">
      <UserBar user={me} address={address ?? null} notifications={notifications} />
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
