// 운영자 — 회원 관리. 전체 회원 목록 + 검색·필터·정렬 + 상태 배지.
// 행 클릭 → 상세 콘솔(/admin/members/[id]). 운영 액션은 상세에서.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listAllMembers } from "@/lib/admin-queries";
import { MembersClient } from "./MembersClient";
import { RefreshTagsButton } from "../tags/RefreshTagsButton";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const members = await listAllMembers();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 bg-brand-50/40 p-4">
      <header className="flex items-end justify-between px-1 py-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">회원 관리</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">전체 회원 {members.length}명 · 검색·필터·제재</p>
        </div>
        <RefreshTagsButton />
      </header>

      <MembersClient members={members} />
    </main>
  );
}
