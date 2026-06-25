// 상자 위에 과일이 쌓인 일러스트 (자체 제작 SVG).
// 실제 상품 사진(저작권) 대신 배너/상세 히어로에 사용.
// 부모 크기에 맞춰 채워지며 중앙 정렬(meet).

export function FruitBoxArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="상자 위에 쌓인 복숭아 일러스트"
    >
      <defs>
        <radialGradient id="fruit" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFD8C2" />
          <stop offset="45%" stopColor="#FF9F8B" />
          <stop offset="100%" stopColor="#F0635A" />
        </radialGradient>
        <linearGradient id="boxFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E7A864" />
          <stop offset="100%" stopColor="#D08C45" />
        </linearGradient>
        <linearGradient id="boxTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5C98C" />
          <stop offset="100%" stopColor="#EBB672" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="100" cy="176" rx="64" ry="9" fill="#000000" opacity="0.08" />

      {/* 상자 */}
      <path d="M40 132 L160 132 L152 174 L48 174 Z" fill="url(#boxFront)" />
      <path d="M40 132 L55 118 L145 118 L160 132 Z" fill="url(#boxTop)" />
      {/* 상자 라벨 */}
      <rect x="74" y="142" width="52" height="20" rx="4" fill="#FFFFFF" opacity="0.85" />
      <rect x="80" y="148" width="40" height="3.4" rx="1.7" fill="#D08C45" />
      <rect x="80" y="154" width="26" height="3.4" rx="1.7" fill="#E7A864" />

      {/* 과일 더미 — 뒷줄 */}
      <Fruit cx={74} cy={92} r={19} leaf />
      <Fruit cx={104} cy={86} r={20} leaf />
      <Fruit cx={134} cy={93} r={18} />
      {/* 앞줄 */}
      <Fruit cx={60} cy={110} r={20} />
      <Fruit cx={92} cy={112} r={21} leaf />
      <Fruit cx={124} cy={111} r={21} />
      <Fruit cx={150} cy={106} r={17} />
    </svg>
  );
}

function Fruit({
  cx,
  cy,
  r,
  leaf,
}: {
  cx: number;
  cy: number;
  r: number;
  leaf?: boolean;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#fruit)" />
      {/* 가운데 골 */}
      <path
        d={`M${cx} ${cy - r + 2} Q ${cx + 2} ${cy} ${cx} ${cy + r - 2}`}
        stroke="#D9534F"
        strokeWidth="1.2"
        fill="none"
        opacity="0.35"
      />
      {/* 하이라이트 */}
      <ellipse
        cx={cx - r * 0.32}
        cy={cy - r * 0.4}
        rx={r * 0.32}
        ry={r * 0.22}
        fill="#FFFFFF"
        opacity="0.55"
      />
      {/* 잎 */}
      {leaf && (
        <path
          d={`M${cx + 1} ${cy - r + 1} q 9 -8 16 -3 q -4 9 -15 5 z`}
          fill="#6FBF63"
        />
      )}
    </g>
  );
}
