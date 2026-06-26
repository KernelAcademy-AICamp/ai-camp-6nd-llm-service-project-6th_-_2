"use client";

// 운영자 좌측 사이드바 — 현재 경로로 활성 탭 강조.
// 모바일은 아이콘만(라벨 숨김), sm+ 에서 라벨 노출.

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BrandMark,
  DashboardIcon,
  NeighborhoodIcon,
  MembersIcon,
  BoardIcon,
  ReportIcon,
} from "./admin-icons";

type IconCmp = (p: { className?: string }) => JSX.Element;

const ITEMS: { key: string; label: string; href: Route; Icon: IconCmp; match: (p: string) => boolean }[] = [
  { key: "dashboard", label: "대시보드", href: "/admin/dashboard" as Route, Icon: DashboardIcon, match: (p) => p.startsWith("/admin/dashboard") },
  { key: "neighborhoods", label: "활성 동네", href: "/admin/neighborhoods" as Route, Icon: NeighborhoodIcon, match: (p) => p.startsWith("/admin/neighborhoods") },
  { key: "members", label: "회원 관리", href: "/admin/members" as Route, Icon: MembersIcon, match: (p) => p.startsWith("/admin/members") },
  { key: "board", label: "게시판 관리", href: "/admin/board" as Route, Icon: BoardIcon, match: (p) => p.startsWith("/admin/board") || p.startsWith("/admin/parties") || p.startsWith("/admin/community") },
  { key: "reports", label: "신고/분쟁", href: "/admin/reports" as Route, Icon: ReportIcon, match: (p) => p.startsWith("/admin/reports") },
];

export function AdminSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-white p-2 sm:w-44 sm:p-3">
      <div className="mb-2 flex items-center gap-2 px-1.5 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand text-white" aria-hidden>
          <BrandMark className="h-5 w-5" />
        </span>
        <span className="hidden sm:inline">
          <span className="block text-sm font-bold leading-tight text-brand-dark">띵동</span>
          <span className="block text-[10px] font-medium leading-tight text-zinc-400">운영자 콘솔</span>
        </span>
      </div>
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        const { Icon } = it;
        return (
          <Link
            key={it.key}
            href={it.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] font-semibold transition-colors",
              active
                ? "bg-brand text-white shadow-sm shadow-brand/30"
                : "text-zinc-600 hover:bg-brand-50 hover:text-brand-dark",
            )}
            title={it.label}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">{it.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
