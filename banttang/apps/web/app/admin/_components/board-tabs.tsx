// 게시판 관리 서브탭 — 모집글 ↔ 커뮤니티 전환. (사이드바 "게시판 관리" 하위)
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

type Key = "parties" | "community";
const TABS: { key: Key; label: string; href: Route }[] = [
  { key: "parties", label: "모집글", href: "/admin/board" as Route },
  { key: "community", label: "커뮤니티", href: "/admin/community" as Route },
];

export function BoardTabs({ active }: { active: Key }) {
  return (
    <nav className="flex gap-1.5 px-1 text-[13px] font-semibold">
      {TABS.map((t) =>
        t.key === active ? (
          <span key={t.key} className="rounded-full bg-brand px-3 py-1 text-white shadow-sm shadow-brand/30">{t.label}</span>
        ) : (
          <Link key={t.key} href={t.href} className="rounded-full bg-white px-3 py-1 text-zinc-500 ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-dark">
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
