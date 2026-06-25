// 운영자 — 회원 통합 콘솔(서버 컴포넌트).
// 프로필 카운트 · 성향 태그 · 카테고리 분포 · 활동 타임라인 · 추천 점수 내역.
// /admin/members/[id] 에서 마운트. (기존 /admin/recommend 디버거 + 타임라인 통합)
//   docs/admin-user-management.md §9 Phase 3

import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed, type FeedCard } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";
import { getRankingSignals } from "@/lib/naver/signals";
import { explainCard, categoryInfoFor, SECTION_LABEL, type SignalSource } from "@/lib/naver/personalize";
import { getUserActivity } from "@/lib/admin/user-activity";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_N = 12;
const TAG_WINDOW_DAYS = 30;

const GENDER_LABEL: Record<string, string> = { female: "여성", male: "남성", prefer_not_to_say: "비공개" };

const TAG_EMOJI: Record<string, string> = {
  food_focused: "🍎", value_seeker: "💰", active_participant: "👥",
  evening_user: "🌙", costco_lover: "🏬", weekend_user: "📅",
};

const ACTIVITY: Record<string, { emoji: string; verb: string }> = {
  search: { emoji: "🔍", verb: "검색" },
  click: { emoji: "👆", verb: "클릭" },
  favorite: { emoji: "❤️", verb: "찜" },
  groupbuy: { emoji: "👥", verb: "공구 참여" },
};

const SOURCE_COLOR: Record<SignalSource, string> = {
  interest: "text-zinc-600", gender: "text-zinc-600", favorite: "text-blue-600",
  groupbuy: "text-blue-700", search: "text-blue-500", tag: "text-violet-600",
};

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}
function dayKey(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY_MS);
  const label = diff === 0 ? "오늘" : diff === 1 ? "어제" : `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return { key, label };
}
function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type ConsoleProfile = {
  id: string;
  nickname: string;
  gender: string;
  joined_at: string;
  favorite_categories: string[] | null;
  transaction_count: number;
  good_review_count: number;
  neighborhoods: { id: string; name: string; district: string } | null;
};

type TagRow = { tag: string; confidence: number; evidence: string; updated_at: string };

export async function MemberConsole({
  profile,
  headerAction,
}: {
  profile: ConsoleProfile;
  headerAction?: React.ReactNode;
}) {
  const admin = createAdminClient();

  const countOf = async (q: Promise<{ count: number | null }>): Promise<number> =>
    q.then((r) => r.count ?? 0).catch(() => 0);
  const [favCount, gbCount, searchCount] = await Promise.all([
    countOf(admin.from("store_favorites").select("id", { count: "exact", head: true }).eq("user_id", profile.id)),
    countOf(admin.from("group_buy_participants").select("id", { count: "exact", head: true }).eq("user_id", profile.id)),
    countOf(admin.from("user_events").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("kind", "search")),
  ]);

  const tagSince = new Date(Date.now() - TAG_WINDOW_DAYS * DAY_MS).toISOString();
  const [tagsRes, distRes, rulesRes, activity] = await Promise.all([
    admin.from("user_tags").select("tag, confidence, evidence, updated_at").eq("user_id", profile.id)
      .order("confidence", { ascending: false }).then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    admin.from("user_events").select("section").eq("user_id", profile.id).gte("created_at", tagSince)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    admin.from("tag_rules").select("tag, label").then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    getUserActivity(profile.id, 50),
  ]);

  const tags = (tagsRes.data ?? []) as TagRow[];
  const ruleLabels = new Map(((rulesRes.data ?? []) as { tag: string; label: string }[]).map((r) => [r.tag, r.label]));
  const distEvents = (distRes.data ?? []) as { section: string | null }[];
  const distBySection = new Map<string, number>();
  for (const e of distEvents) distBySection.set(e.section ?? "기타", (distBySection.get(e.section ?? "기타") ?? 0) + 1);
  const distribution = Array.from(distBySection.entries())
    .map(([section, n]) => ({
      label: SECTION_LABEL[section as keyof typeof SECTION_LABEL] ?? "기타",
      pct: distEvents.length ? Math.round((100 * n) / distEvents.length) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
  const lastTagUpdate = tags.length
    ? tags.reduce((max, t) => (t.updated_at > max ? t.updated_at : max), tags[0].updated_at) : null;

  const interestLabels = Array.from(new Set(
    (profile.favorite_categories ?? []).map((v) => categoryInfoFor(v)?.section)
      .filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => SECTION_LABEL[s]),
  ));
  const joinedDays = Math.max(0, Math.floor((Date.now() - Date.parse(profile.joined_at)) / DAY_MS));
  const nb = profile.neighborhoods;

  // 활동 타임라인 날짜 그룹
  const groups: { label: string; items: typeof activity }[] = [];
  for (const a of activity) {
    const { label } = dayKey(a.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }

  // 추천 점수는 네이버 피드(외부 API)라 무거움 → 아래 <Suspense>로 분리해 스트리밍.

  return (
    <>
      {/* 사용자 카드 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-500">
            {profile.nickname.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-zinc-900">{profile.nickname}</p>
            <p className="truncate text-[12px] text-zinc-500">
              {[nb?.name ?? "동네 미설정", GENDER_LABEL[profile.gender] ?? profile.gender, `가입 ${joinedDays}일`].join(" · ")}
            </p>
          </div>
          {headerAction}
        </div>
        <div className="mt-3 flex border-t border-zinc-100 pt-3">
          {[
            { k: "완료 거래", v: profile.transaction_count },
            { k: "찜", v: favCount },
            { k: "공구", v: gbCount },
            { k: "검색", v: searchCount },
            { k: "후기", v: `+${profile.good_review_count}`, c: "text-emerald-600" },
          ].map((s, i) => (
            <div key={s.k} className={`flex-1 text-center ${i > 0 ? "border-l border-zinc-100" : ""}`}>
              <p className={`text-[16px] font-bold text-zinc-900 ${s.c ?? ""}`}>{s.v}</p>
              <p className="text-[11px] text-zinc-500">{s.k}</p>
            </div>
          ))}
        </div>
        {interestLabels.length > 0 && (
          <p className="mt-2 text-[11px] text-zinc-400">관심사 {interestLabels.join(" · ")}</p>
        )}
      </section>

      {/* 성향 태그 · 카테고리 분포 (좌우 배치) */}
      <div className="grid gap-2 sm:grid-cols-2">
        {/* 성향 태그 */}
        <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
          <p className="mb-1 text-[13px] font-semibold text-zinc-700">부여된 태그 <span className="text-zinc-400">({tags.length}개)</span></p>
          {tags.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-400">아직 부여된 태그가 없어요.</p>
          ) : (
            <div className="-mx-1">
              {tags.map((t, i) => (
                <div key={t.tag} className={`flex items-start gap-3 px-1 py-2.5 ${i > 0 ? "border-t border-zinc-100" : ""}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base">{TAG_EMOJI[t.tag] ?? "🏷"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-zinc-900">{ruleLabels.get(t.tag) ?? t.tag}</p>
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500">{Number(t.confidence).toFixed(2)}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{t.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 카테고리 분포 */}
        <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
          <p className="mb-2.5 text-[13px] font-semibold text-zinc-700">카테고리 활동 분포</p>
          {distribution.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-400">최근 활동이 없어요.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {distribution.map((d) => (
                  <div key={d.label} className="flex items-center gap-3 text-[12px]">
                    <span className="w-9 shrink-0 text-zinc-600">{d.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand" style={{ width: `${d.pct}%` }} /></div>
                    <span className="w-9 shrink-0 text-right font-semibold text-zinc-700">{d.pct}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px] text-zinc-400">
                <span>최근 {TAG_WINDOW_DAYS}일 기준</span><span>{timeAgo(lastTagUpdate)} 갱신</span>
              </div>
            </>
          )}
        </section>
      </div>

      {/* 활동 타임라인 */}
      <div className="px-1 pt-1 text-[13px] font-semibold text-zinc-700">활동 타임라인 <span className="text-zinc-400">· 최근 {activity.length}건</span></div>
      {activity.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5 text-center text-xs text-zinc-400">기록된 활동이 없어요.</p>
      ) : (
        <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
          {groups.map((g) => (
            <div key={g.label} className="mb-3 last:mb-0">
              <p className="mb-2 text-[11px] font-semibold text-zinc-500">{g.label}</p>
              <ul className="flex flex-col gap-2.5">
                {g.items.map((a, i) => {
                  const meta = ACTIVITY[a.kind] ?? { emoji: "•", verb: a.kind };
                  return (
                    <li key={i} className="flex items-center gap-2.5 text-[12.5px]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px]">{meta.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-700">
                        ‘{a.keyword}’ {meta.verb}
                        {a.price != null && <span className="text-zinc-400"> · {a.price.toLocaleString("ko-KR")}원</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400">{clock(a.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* 추천 결과 — 외부 피드라 느려서 스트리밍(나머지는 즉시 표시) */}
      <Suspense fallback={<RecommendationSkeleton />}>
        <RecommendationSection profile={profile} />
      </Suspense>
    </>
  );
}

// 추천 점수 섹션 — 네이버 동네 피드(외부 API) + 신호 스코어링. 무거워서 별도 async.
async function RecommendationSection({ profile }: { profile: ConsoleProfile }) {
  const nb = profile.neighborhoods;
  const signals = await getRankingSignals(profile.id, {
    favoriteCategories: profile.favorite_categories ?? [],
    gender: profile.gender,
  });
  let scored: { card: FeedCard; explain: ReturnType<typeof explainCard> }[] = [];
  let feedError: string | null = null;
  if (!nb) feedError = "동네가 설정되지 않아 후보 피드를 만들 수 없어요.";
  else if (!isNaverConfigured()) feedError = "네이버 검색이 설정되지 않았어요.";
  else {
    try {
      const { feed } = await getNeighborhoodFeed({ neighborhoodId: nb.id, name: nb.name, district: nb.district });
      const seen = new Set<string>();
      const all: FeedCard[] = [];
      for (const cards of Object.values(feed.sections)) for (const c of cards) {
        if (seen.has(c.link)) continue;
        seen.add(c.link); all.push(c);
      }
      scored = all.map((card) => ({ card, explain: explainCard(card, signals) }))
        .sort((a, b) => b.explain.total - a.explain.total).slice(0, TOP_N);
    } catch { feedError = "후보 피드를 불러오지 못했어요."; }
  }

  return (
    <>
      <div className="px-1 pt-1 text-[13px] font-semibold text-zinc-700">추천 결과 <span className="text-zinc-400">· 점수 순 · 상위 {scored.length}건</span></div>
      {feedError ? (
        <p className="px-1 py-8 text-center text-sm text-zinc-500">{feedError}</p>
      ) : scored.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-zinc-500">후보가 없어요.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {scored.map(({ card, explain }, i) => (
            <li key={card.link} className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-zinc-400">#{i + 1}</p>
                  <p className="mt-0.5 text-[14px] font-bold leading-snug text-zinc-900">{card.title}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{SECTION_LABEL[card.section]} · {card.subtitle || "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-zinc-400">총점</p>
                  <p className="text-lg font-extrabold text-zinc-900">{explain.total.toFixed(1)}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-zinc-100 pt-2">
                {explain.lines.length === 0 ? (
                  <p className="text-[12px] text-zinc-400">매칭된 신호 없음 (기본 노출)</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {explain.lines.map((l, j) => (
                      <li key={j} className="flex items-baseline justify-between text-[12px]">
                        <span className="text-zinc-600">
                          {l.label}
                          {l.decay < 1 && <span className="ml-1 text-[11px] text-zinc-400">(기본 {fmtSigned(l.base)} · {l.ageDays}일 전 ×{l.decay.toFixed(2)})</span>}
                        </span>
                        <span className={`shrink-0 font-semibold ${SOURCE_COLOR[l.source]}`}>{fmtSigned(l.net)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function RecommendationSkeleton() {
  return (
    <>
      <div className="px-1 pt-1 text-[13px] font-semibold text-zinc-700">
        추천 결과 <span className="text-zinc-400">· 불러오는 중…</span>
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-zinc-200/70 bg-zinc-100/60" />
        ))}
      </div>
    </>
  );
}
