// 띵동 운영자 콘솔 전용 라인 아이콘 세트.
//   - currentColor 상속 → 활성(흰색)/비활성(회색·그린) 상태에 자동으로 따라감.
//   - 컨셉: 신선식품(아보카도)·둥근 라인·일관된 24 그리드, strokeWidth 1.8(막대류만 2.4).
//   외부 아이콘 라이브러리 없이 직접 그린다.

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// 브랜드 마크 — 띵동 아보카도. 위가 좁고 아래가 둥근 몸통 + 가운데 씨앗.
export function BrandMark({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3c-2.6 0-4.3 2.3-4.3 5.2 0 1.4-1.4 2.6-2 4.2-.4 1-.6 1.9-.6 2.8C5.1 18.6 8 21 12 21s6.9-2.4 6.9-5.8c0-.9-.2-1.8-.6-2.8-.6-1.6-2-2.8-2-4.2C16.3 5.3 14.6 3 12 3Z" />
      <circle cx="12" cy="14.5" r="2.6" />
    </svg>
  );
}

// 대시보드 — 활동 막대(분석).
export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 20.5h16" />
      <path d="M6.5 20V12" strokeWidth={2.4} />
      <path d="M12 20V5" strokeWidth={2.4} />
      <path d="M17.5 20v-5" strokeWidth={2.4} />
    </svg>
  );
}

// 회원 관리 — 함께 모인 두 사람.
export function MembersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="9.5" cy="8" r="3.1" />
      <path d="M3.8 19a5.7 5.7 0 0 1 11.4 0" />
      <path d="M16.2 5.4a3 3 0 0 1 0 5.5" />
      <path d="M17.4 13.6a5 5 0 0 1 2.8 4.9" />
    </svg>
  );
}

// 게시판 관리 — 글이 담긴 보드.
export function BoardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="4" y="3.5" width="16" height="17" rx="3.2" />
      <path d="M8 8.5h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16.5h5" />
    </svg>
  );
}

// 활성 동네 — 위치 핀.
export function NeighborhoodIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 21c4-4 6.5-7.2 6.5-11a6.5 6.5 0 0 0-13 0c0 3.8 2.5 7 6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

// 신고/분쟁 — 보호 방패 + 주의.
export function ReportIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3.2l7 2.6v5.3c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V5.8z" />
      <path d="M12 8.6v3.6" />
      <path d="M12 15.6h.01" />
    </svg>
  );
}
