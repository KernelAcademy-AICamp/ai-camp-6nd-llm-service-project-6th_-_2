import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { NotificationsList } from "@/components/NotificationsList";

export const dynamic = "force-dynamic";

// 알림함 — 날짜별 그룹 + 카드 리스트. 진입 즉시 모든 알림 읽음 처리.
export default async function NotificationsPage() {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  // 1) 조회 (최신순)
  const { data } = await sb
    .from("notifications")
    .select("id, type, title, body, link_path, is_read, created_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // 2) 읽지 않은 항목 일괄 읽음 처리 (UserBar 배지 빨리 비우기)
  await sb
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", me.id)
    .eq("is_read", false);

  return (
    <NotificationsList
      items={
        (data ?? []) as Array<{
          id: string;
          type: string | null;
          title: string;
          body: string | null;
          link_path: string | null;
          is_read: boolean;
          created_at: string;
        }>
      }
    />
  );
}
