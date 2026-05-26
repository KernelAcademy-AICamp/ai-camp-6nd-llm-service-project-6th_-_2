import { cn } from "@/lib/utils";

interface AvatarProps {
  nickname: string;
  src?: string | null;
  size?: number;
  className?: string;
}

// 프로필 이미지가 없을 땐 닉네임 첫 글자를 색상 칩으로 표시.
export function Avatar({ nickname, src, size = 28, className }: AvatarProps) {
  const initial = nickname.trim().charAt(0).toUpperCase() || "?";
  const bg = pickBgColor(nickname);

  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        bg,
        className,
      )}
      title={nickname}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={nickname} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

const PALETTE = [
  "bg-rose-400",
  "bg-orange-400",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
];

function pickBgColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
