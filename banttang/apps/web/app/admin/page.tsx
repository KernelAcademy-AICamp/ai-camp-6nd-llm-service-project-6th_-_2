// 운영자 첫 진입(/admin) → 대시보드로. 비운영자는 홈으로.
// 게시판 관리(모집글 목록)는 /admin/board 로 이동했다.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }
  redirect("/admin/dashboard");
}
