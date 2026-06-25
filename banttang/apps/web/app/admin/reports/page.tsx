// 운영자 — 신고/분쟁 처리. 모든 동네의 신고를 상태 구분 없이 본다.
// 봇 라이브 루프(scripts/bots-live.mjs 의 report 액션)가 거래 분쟁을 여기로 흘려보낸다.
// 화면: 상태 필터 + 신고자→피신고자 큐 + 당사자 카드(거래/좋아요/싫어요/경고/신고) + 처리 액션.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listReportCases } from "@/lib/admin-queries";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const cases = await listReportCases();
  const pending = cases.filter((r) => r.status === "pending" || r.status === "reviewing").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-3 bg-brand-50/40 p-4">
      <header className="flex items-end justify-between px-1 py-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">신고 / 분쟁 처리</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">신고자 → 피신고자 · 검토·처리</p>
        </div>
        <span className="text-xs text-zinc-500">
          전체 {cases.length}건 · 미처리 <span className="font-bold text-rose-600">{pending}</span>건
        </span>
      </header>
      <ReportsClient cases={cases} />
    </main>
  );
}
