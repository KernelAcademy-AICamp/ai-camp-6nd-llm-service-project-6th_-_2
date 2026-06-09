import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 마이페이지 허브 — 프로필 카드 + 이용 내역 / 고객센터 메뉴 그룹.
// 주문 목록은 /mypage/orders 서브 페이지로 이동.
export default async function MyPage() {
  const me = await requireCurrentUser();

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 상단: 타이틀 + 설정 */}
      <header className="flex items-center justify-between px-1 pb-1">
        <h1 className="flex-1 text-center text-[16px] font-bold text-zinc-900">
          마이페이지
        </h1>
        <button
          type="button"
          aria-label="설정"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100"
        >
          <SettingsIcon />
        </button>
      </header>

      {/* 프로필 카드 */}
      <Link
        href={"/mypage/profile" as any}
        className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm active:bg-zinc-50"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50">
          <PersonAvatar />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold text-zinc-900">
            {me.nickname}
          </p>
        </div>
        <ChevronRight />
      </Link>

      {/* 이용 내역 */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h2 className="px-4 pb-1 pt-4 text-[13px] font-bold text-zinc-900">
          이용 내역
        </h2>
        <MenuItem
          icon={<DocIcon />}
          label="만든 주문"
          href={"/mypage/orders?tab=hosted" as any}
        />
        <MenuItem
          icon={<PeopleIcon />}
          label="참여한 주문"
          href={"/mypage/orders?tab=joined" as any}
        />
        <MenuItem
          icon={<HeartChatIcon />}
          label="띵동 후기"
          href={"/mypage/reviews" as any}
        />
      </section>

      {/* 고객센터 */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h2 className="px-4 pb-1 pt-4 text-[13px] font-bold text-zinc-900">
          고객센터
        </h2>
        <MenuItem icon={<MegaphoneIcon />} label="공지사항" href={"#" as any} />
        <MenuItem
          icon={<QuestionIcon />}
          label="자주하는 질문"
          href={"#" as any}
        />
      </section>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href as any}
      className="flex items-center gap-3 border-t border-zinc-100 px-4 py-3.5 first:border-0 active:bg-zinc-50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-zinc-800">{label}</span>
      <ChevronRight />
    </Link>
  );
}

// ─── icons (인라인 SVG) ───
function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-zinc-400"
      aria-hidden
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonAvatar() {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
      <circle cx="32" cy="24" r="11" fill="#9ca3af" />
      <path
        d="M10 60c0-12 9.85-22 22-22s22 10 22 22"
        fill="#16a34a"
      />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" fill="#3b82f6" />
      <rect x="8" y="7" width="8" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8" y="11" width="8" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8" y="15" width="5" height="1.6" rx="0.8" fill="#fff" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3.6" fill="#60a5fa" />
      <circle cx="16" cy="10" r="2.8" fill="#3b82f6" />
      <path
        d="M2.5 19c0-3.2 3-5.5 6.5-5.5s6.5 2.3 6.5 5.5"
        fill="#60a5fa"
      />
      <path
        d="M14 19c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"
        fill="#3b82f6"
        fillOpacity="0.85"
      />
    </svg>
  );
}

function HeartChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3h-7l-4 3v-3H6a3 3 0 01-3-3V7z"
        fill="#fda4af"
      />
      <path
        d="M12 14.5l-3.2-2.8a2.2 2.2 0 113.2-3 2.2 2.2 0 113.2 3L12 14.5z"
        fill="#fff"
      />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10v4l13 5V5L3 10z"
        fill="#ef4444"
      />
      <rect x="16" y="9" width="3" height="6" rx="1.5" fill="#dc2626" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#bfdbfe" />
      <path
        d="M9.5 9.5a2.5 2.5 0 115 0c0 1.4-1 2-2 2.5s-1.5 1-1.5 2"
        stroke="#1d4ed8"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="17" r="1.1" fill="#1d4ed8" />
    </svg>
  );
}
