// 운영자 — 회원 상세 콘솔. 프로필·성향·분포·활동 타임라인·추천 점수 + 운영 액션.
//   docs/admin-user-management.md §9 Phase 3

import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MemberConsole, type ConsoleProfile } from "../../_components/member-console";
import { MemberActions } from "./MemberActions";

export const dynamic = "force-dynamic";

type Row = ConsoleProfile & { is_admin: boolean; is_bot: boolean; suspended_at: string | null };

export default async function MemberDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const { data } = await createAdminClient()
    .from("profiles")
    .select(
      "id, nickname, gender, joined_at, favorite_categories, transaction_count, good_review_count, " +
        "is_admin, is_bot, suspended_at, neighborhoods(id, name, district)",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const row = data as Record<string, unknown>;
  const nbRaw = row.neighborhoods;
  const profile = {
    ...row,
    neighborhoods: (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) ?? null,
  } as Row;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 bg-brand-50/40 p-4">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Link href={"/admin/members" as Route} className="text-lg text-zinc-500" aria-label="목록">‹</Link>
          <h1 className="text-lg font-bold text-zinc-900">{profile.nickname}</h1>
          {profile.is_admin && <span className="rounded-full bg-brand-dark px-1.5 py-0.5 text-[10px] font-semibold text-white">운영자</span>}
          {profile.is_bot && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">봇</span>}
          {profile.suspended_at && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">제재</span>}
        </div>
        <span className="text-xs text-zinc-500">회원 상세</span>
      </header>

      <MemberConsole
        profile={profile}
        headerAction={
          <MemberActions
            userId={profile.id}
            isAdmin={profile.is_admin}
            isBot={profile.is_bot}
            suspended={!!profile.suspended_at}
          />
        }
      />
    </main>
  );
}
