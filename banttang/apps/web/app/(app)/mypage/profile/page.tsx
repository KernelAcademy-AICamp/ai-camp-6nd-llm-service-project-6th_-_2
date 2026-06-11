import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { levelLabel } from "@/lib/party-status";
import { ProfileEditForm } from "@/components/ProfileEditForm";

export const dynamic = "force-dynamic";

// 내 프로필 — 신뢰점수 요약(조회) + 닉네임 편집. (UserBar 가 mypage 서브페이지에 ← 헤더 제공)
const LEVEL_EMOJI: Record<string, string> = {
  dandelion: "🌱",
  tree: "🌳",
  king: "👑",
};

export default async function ProfilePage() {
  const me = await requireCurrentUser();

  // 동네 이름 조회 (있으면)
  let neighborhoodName: string | null = null;
  if (me.neighborhood_id) {
    const sb = getServiceClient();
    const { data } = await sb
      .from("neighborhoods")
      .select("name")
      .eq("id", me.neighborhood_id)
      .maybeSingle();
    neighborhoodName = (data?.name as string | undefined) ?? null;
  }

  const emoji = LEVEL_EMOJI[me.level] ?? "🌱";

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 신뢰점수 요약 카드 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50">
            <PersonAvatar />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold text-zinc-900">{me.nickname}</p>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              {emoji} {levelLabel[me.level] ?? me.level} 등급
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4 text-center">
          <Stat label="거래" value={`${me.transaction_count}회`} />
          <Stat label="👍 좋아요" value={`${me.good_review_count}`} />
          <Stat label="👎 별로" value={`${me.bad_review_count}`} />
        </div>

        {neighborhoodName && (
          <p className="mt-3 text-[13px] text-zinc-500">📍 {neighborhoodName}</p>
        )}
      </section>

      {/* 닉네임 편집 */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-[14px] font-bold text-zinc-900">프로필 편집</h2>
        <ProfileEditForm initialNickname={me.nickname} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[17px] font-bold text-zinc-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

function PersonAvatar() {
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
      <circle cx="32" cy="24" r="11" fill="#9ca3af" />
      <path d="M10 60c0-12 9.85-22 22-22s22 10 22 22" fill="#16a34a" />
    </svg>
  );
}
