// 운영자 공용 레이아웃 — 좌측 사이드바 + 콘텐츠. (각 페이지는 콘텐츠만 렌더)
import { AdminSidebar } from "./_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <AdminSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
