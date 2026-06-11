import { cn } from "@/lib/utils";

// 프로필 이미지가 없는 단계(Phase 1)라 닉네임 기반으로 결정적 그라데이션
// 아바타를 생성한다. 같은 닉네임 → 항상 같은 색.
const GRADIENTS = [
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-lime-400 to-green-500",
  "from-fuchsia-400 to-pink-500",
  "from-cyan-400 to-blue-500",
];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function CommunityAvatar({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) {
  const g = GRADIENTS[hashIndex(name || "?", GRADIENTS.length)];
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
        g,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

// 신뢰등급 뱃지 이모지
const LEVEL_EMOJI: Record<string, string> = {
  dandelion: "🌱",
  tree: "🌳",
  king: "👑",
};

export function levelEmoji(level: string): string {
  return LEVEL_EMOJI[level] ?? "🌱";
}
