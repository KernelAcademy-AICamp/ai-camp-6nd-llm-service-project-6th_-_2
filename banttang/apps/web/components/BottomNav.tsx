"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/feed", label: "홈", icon: "🏠" },
  { href: "/host/new", label: "주문 등록", icon: "➕" },
  { href: "/mypage", label: "마이", icon: "👤" },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 border-t border-zinc-200 bg-white">
      {tabs.map((t) => {
        const active = pathname === t.href || (t.href !== "/feed" && pathname.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href as any}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-3 text-[11px]",
              active ? "text-brand" : "text-zinc-400",
            )}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
