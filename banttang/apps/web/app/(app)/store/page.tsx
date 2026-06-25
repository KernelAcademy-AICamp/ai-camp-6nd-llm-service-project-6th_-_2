// 스토어 — 검색바 + 광고 배너 + 카테고리 아이콘 + 동네 맞춤 추천 피드.
// 혜택·쿠폰·청년 지원 정보 자리이며, 1단계로 네이버 검색 기반 추천 피드를 보여준다.
// (app) 레이아웃이 로그인을 보장 → 서버에서 직접 getNeighborhoodFeed 호출.

import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed, getPersonalizedFeed } from "@/lib/naver/cache";
import {
  isNaverConfigured,
  searchShop,
  searchLocal,
  searchImage,
  naverShoppingSearchUrl,
  naverMapSearchUrl,
} from "@/lib/naver/client";
import {
  buildSearchQueries,
  ALL_INTERESTS,
  type FeedSection,
  type SearchQuery,
} from "@/lib/naver/query-builder";
import { StoreFeedTabs, type StoreSection } from "@/components/StoreFeedTabs";
import { StoreDebugQueries } from "@/components/StoreDebugQueries";
import { StoreRefreshButton } from "@/components/StoreRefreshButton";
import { StoreAdCarousel } from "@/components/StoreAdCarousel";
import { StoreSearchResults } from "@/components/StoreSearchResults";
import { ScrollToTop } from "@/components/ScrollToTop";
import type { StoreCardData } from "@/components/StoreCard";
import { rankSections, buildPersonalizedQueries, type FeedPrefs } from "@/lib/naver/personalize";
import type { CurrentUser } from "@/lib/auth";
import { getRankingSignals } from "@/lib/naver/signals";
import { logUserEvent } from "@/lib/store-events";
import { getFavoritedLinks } from "@/app/_actions/store-favorites";
import { getAiRecommendationCards } from "@/lib/recommend/read";
import { getHotDealCards } from "@/lib/hotdeal/read";
import { GROUP_BUYS, groupBuyDiscountRate } from "@/lib/groupbuy";

export const dynamic = "force-dynamic";

// label  : 아이콘 행에 쓰는 짧은 카테고리명
// title  : 추천 탭 섹션 헤더에 쓰는 컨셉 문구(같이 사서 나눠 쓰자는 가치 제안)
const SECTION_META: Record<FeedSection, { emoji: string; label: string; title: string }> = {
  delivery: { emoji: "🍽️", label: "음식점", title: "혼자 먹기 부담스러운 음식, 같이 시켜 나눠요" },
  // market 의 title 은 store/page 에서 동네명을 끼워 "{동네} 주변 마켓"으로 덮어쓴다.
  market: { emoji: "🛒", label: "주변 마켓", title: "주변 마켓" },
  food: { emoji: "🥗", label: "식품", title: "대용량 식재료, 1인분씩 나눠요" },
  health: { emoji: "💊", label: "건강", title: "영양제·건강템, 같이 사면 부담 덜어요" },
  living: { emoji: "🛋️", label: "리빙", title: "휴지·세제 대용량, 같이 나눠 써요" },
  beauty: { emoji: "💄", label: "뷰티", title: "뷰티템, 같이 사서 나눠요" },
  fashion: { emoji: "👕", label: "패션", title: "패션·잡화, 같이 둘러봐요" },
};
const SECTION_ORDER: FeedSection[] = [
  "delivery",
  "market",
  "food",
  "health",
  "living",
  "beauty",
  "fashion",
];

// 안내 문구만 보여주는 공통 빈 상태
function EmptyState({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 text-4xl" aria-hidden>
        🛍️
      </span>
      <h1 className="text-lg font-bold text-zinc-900">스토어</h1>
      <p className="mt-2 whitespace-pre-line text-sm text-zinc-500">{message}</p>
    </main>
  );
}

// 검색바 — 탭하면 전용 검색 화면(/store/search)으로. (홈 feed 와 동일 패턴)
// defaultValue 가 있으면(결과 화면) 현재 검색어를 보여주고, 없으면 placeholder.
function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="relative">
      <Link
        href={"/store/search" as Route}
        className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-[13px] active:bg-zinc-50"
      >
        <span className={defaultValue ? "truncate text-zinc-800" : "text-zinc-400"}>
          {defaultValue || "상품·음식점 검색"}
        </span>
      </Link>
      {/* 홈(feed) 검색바와 동일한 돋보기 아이콘 */}
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        aria-hidden
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {/* 검색 중이면 X — 누르면 검색 해제하고 스토어 메인으로 (홈 검색과 동일) */}
      {defaultValue && (
        <Link
          href="/store"
          aria-label="검색 닫기"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </Link>
      )}
    </div>
  );
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const me = await getCurrentUser();
  if (!me) return <EmptyState message={"로그인이 필요해요."} />;

  // 검색 모드 — q 가 있으면 음식점(네이버 지역검색) + 쇼핑(네이버 쇼핑검색)을
  // 동시에 조회해 세그먼트 탭으로 보여준다 (동네 무관).
  const q = (searchParams.q ?? "").trim();
  if (q) {
    if (!isNaverConfigured()) {
      return <EmptyState message={"검색을 사용할 수 없어요."} />;
    }
    // 추천 개인화 신호 5(검색 이력) — best-effort, 결과를 기다리지 않음.
    // 섹션은 logUserEvent가 keyword 역매칭으로 채운다(중앙 처리).
    void logUserEvent({ userId: me.id, kind: "search", keyword: q });
    const [places, items, favLinkArr] = await Promise.all([
      searchLocal(q, { display: 12 }).catch(() => []),
      searchShop(q, { display: 20 }).catch(() => []),
      getFavoritedLinks(),
    ]);
    const favLinks = new Set(favLinkArr); // 이미 찜한 항목 하트 채우기용

    // 음식점 → 카드: 지역검색은 사진이 없으므로 이미지검색으로 대표 이미지 1장 채움.
    // (검색은 캐시 안 됨 → 결과 수만큼만 병렬 호출, 실패 시 StoreThumb 폴백)
    const foodCards: StoreCardData[] = await Promise.all(
      places.map(async (p) => {
        let image: string | null = null;
        try {
          const [img] = await searchImage(p.name, { display: 1, sort: "sim" });
          image = img?.thumbnail ?? null;
        } catch {
          // 이미지검색 실패 무시
        }
        const fp = new URLSearchParams({ store: p.name });
        if (image) fp.set("image", image);
        // 상세 주소는 빼고 상호명으로만 지도 검색.
        const link = naverMapSearchUrl(p.name);
        return {
          title: p.name,
          subtitle: [p.category, p.road_address || p.address].filter(Boolean).join(" · "),
          link,
          image,
          banttangHref: `/host/new?${fp.toString()}`,
          favoriteKind: "store" as const, // 음식점 = 가게
          initialFavorited: favLinks.has(link),
        };
      }),
    );
    // 쇼핑 → 카드: 가격·몰명, 클릭 시 로그인 게이트 없는 쇼핑 검색 리스트로.
    const shopCards: StoreCardData[] = items.map((it) => {
      const link = naverShoppingSearchUrl(it.title);
      const sp = new URLSearchParams({ store: it.title, tab: "shopping", link });
      if (it.image) sp.set("image", it.image);
      return {
        title: it.title,
        subtitle: `${it.low_price.toLocaleString("ko-KR")}원 · ${it.mall_name}`,
        link,
        image: it.image || null,
        // 쇼핑 결과 → 장보기 탭 + 쇼핑 링크 + 이미지 프리필
        banttangHref: `/host/new?${sp.toString()}`,
        favoriteKind: "product" as const, // 쇼핑 = 상품
        initialFavorited: favLinks.has(link),
      };
    });

    return (
      <main className="flex flex-1 flex-col gap-4 px-4 py-5">
        <h1 className="text-xl font-bold text-zinc-900">스토어</h1>

        <SearchBar defaultValue={q} />

        <StoreSearchResults query={q} foodCards={foodCards} shopCards={shopCards} />

        <ScrollToTop />
      </main>
    );
  }

  // 프로필의 동네 + 온보딩 선호도 조회 (개인화 재정렬용)
  const sb = getServiceClient();
  const { data: profile } = await sb
    .from("profiles")
    .select(
      "neighborhood_id, gender, primary_usage, favorite_categories, neighborhoods(id, name, district)",
    )
    .eq("id", me.id)
    .maybeSingle();

  const nbRaw = profile?.neighborhoods;
  const nb = (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as
    | { id: string; name: string; district: string }
    | undefined;

  if (!nb) {
    return <EmptyState message={"동네를 설정하면\n맞춤 추천을 보여드릴게요."} />;
  }
  if (!isNaverConfigured()) {
    return (
      <EmptyState message={"혜택·쿠폰·청년 지원 정보를 모아 보여드릴 공간이에요.\n곧 만나요!"} />
    );
  }

  const prefs: FeedPrefs = {
    primary_usage: profile?.primary_usage ?? null,
    favorite_categories: profile?.favorite_categories ?? [],
  };

  // 테스트용 — 이 동네 프로필로 생성되는 추천 검색어 (네이버 호출에 쓰이는 그대로)
  const debugQueries = buildSearchQueries({
    neighborhood: { name: nb.name, district: nb.district },
    interests: ALL_INTERESTS,
  });

  // 온보딩 선호도로 만든 "내 맞춤 검색어"
  const personalizedQueries = buildPersonalizedQueries(prefs, {
    name: nb.name,
    district: nb.district,
  });

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-5">
      {/* 헤더 + 갱신 버튼 + 검색어 디버그(테스트용) */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-zinc-900">스토어</h1>
        <div className="flex items-center gap-2">
          {/* 갱신·디버그는 어드민(슈퍼 계정)에게만 노출 */}
          {me.is_admin && <StoreRefreshButton />}
          {me.is_admin && (
            <StoreDebugQueries queries={debugQueries} personalizedQueries={personalizedQueries} />
          )}
        </div>
      </div>

      {/* 검색바 */}
      <SearchBar />

      {/* 광고 배너 슬라이드 — 좌우 여백 없이 꽉 채움(부모 px-4 상쇄) */}
      <div className="-mx-4">
        <StoreAdCarousel />
      </div>

      {/* 카테고리 아이콘 + 맞춤 정보 피드 — 네이버 크롤링이 무거우므로 Suspense 로 스트리밍.
          셸(헤더·검색바·배너)을 즉시 그리고, 피드는 준비되는 대로 채운다.
          첫 진입(캐시 미스)에 네이버 크롤링이 끝날 때까지 빈 화면을 보던 문제 해결. */}
      <Suspense fallback={<StoreFeedSkeleton />}>
        <StoreFeed
          me={me}
          nb={nb}
          prefs={prefs}
          gender={profile?.gender ?? null}
          personalizedQueries={personalizedQueries}
        />
      </Suspense>

      <ScrollToTop />
    </main>
  );
}

// 무거운 네이버 피드 로딩을 전담하는 비동기 서버 컴포넌트.
// StorePage 셸은 즉시 렌더되고, 이 컴포넌트가 resolve 되면 그 자리만 채워진다.
// 독립적인 호출(동네 피드·신호·찜·핫딜·맞춤 피드)은 Promise.all 로 병렬화한다.
async function StoreFeed({
  me,
  nb,
  prefs,
  gender,
  personalizedQueries,
}: {
  me: CurrentUser;
  nb: { id: string; name: string; district: string };
  prefs: FeedPrefs;
  gender: string | null;
  personalizedQueries: SearchQuery[];
}) {
  // market 은 동네명을 끼워 "{동네} 주변 마켓"으로 표기.
  const sectionTitle = (key: FeedSection) =>
    key === "market" ? `${nb.name} 주변 마켓` : SECTION_META[key].title;

  // 서로 독립적인 호출은 한 번에 — 직렬 await 로 누적되던 지연을 제거.
  // - 동네 피드: 실패 시 null → 아래에서 에러 메시지로 폴백
  // - 맞춤 피드: 실패 시 null → 추천 탭은 동네 피드로 폴백
  // - 신호: 관심사(S1)+찜(S3)+공구(S4)+검색·클릭(S5), 정렬만 per-user
  const [feed, personalizedFeed, rankingSignals, favoritedLinks, crawledDeals] =
    await Promise.all([
      getNeighborhoodFeed({ neighborhoodId: nb.id, name: nb.name, district: nb.district })
        .then((r) => r.feed)
        .catch(() => null),
      getPersonalizedFeed(nb.id, personalizedQueries, nb.name).catch(() => null),
      getRankingSignals(me.id, {
        favoriteCategories: prefs.favorite_categories,
        gender,
      }),
      getFavoritedLinks(),
      getHotDealCards(20),
    ]);

  if (!feed) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
        추천을 불러오지 못했어요.
        <br />
        잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  // 카테고리 아이콘은 항상 모두 노출 (비어도 탭 유지). 고정 순서(SECTION_ORDER).
  // 개인화(섹션 순서/카드 가중치)는 ✨추천 탭(recommendSections)에만 적용한다.
  const sections: StoreSection[] = SECTION_ORDER.map((key) => ({
    key,
    title: sectionTitle(key),
    shortLabel: SECTION_META[key].label,
    emoji: SECTION_META[key].emoji,
    cards: feed.sections[key] ?? [],
  }));

  // 맞춤 피드 → 섹션 카드로 만들고 5신호 점수로 재정렬, 카드 있는 섹션만.
  const recommendSections: StoreSection[] = personalizedFeed
    ? rankSections(
        SECTION_ORDER.map((key) => ({
          key,
          title: sectionTitle(key),
          shortLabel: SECTION_META[key].label,
          emoji: SECTION_META[key].emoji,
          cards: personalizedFeed[key] ?? [],
        })),
        rankingSignals,
        { primaryUsage: prefs.primary_usage },
      ).filter((s) => s.cards.length > 0)
    : [];

  // AI 추천(배치 생성) — 동네 피드로 ref 해석. 없으면 빈 배열(레일 미표시 → 기존 추천 폴백).
  const aiCards = await getAiRecommendationCards(me.id, feed.sections);

  // 핫딜 탭 — 모집중 플랫폼 공구(정가→공구가 할인율) + 커뮤니티 RSS 핫딜.
  const dealNow = Date.now();
  const groupBuyDeals: StoreCardData[] = GROUP_BUYS.filter(
    (gb) => Date.parse(gb.deadlineAt) > dealNow,
  ).map((gb) => {
    const opt = gb.options[0];
    const rate = opt ? groupBuyDiscountRate(opt) : 0;
    const subtitle = opt
      ? `${opt.retailPrice.toLocaleString("ko-KR")}원 → ${opt.groupPrice.toLocaleString("ko-KR")}원${rate ? ` (${rate}%↓)` : ""}`
      : gb.subtitle;
    return { title: gb.title, subtitle, link: `/groupbuy/${gb.slug}`, image: null };
  });
  // 공구(우리 인벤토리·전환 목표) 상단 → 크롤 핫딜.
  const hotDealCards = [...groupBuyDeals, ...(crawledDeals ?? [])];

  return (
    <StoreFeedTabs
      sections={sections}
      userLabel={me.nickname}
      regionLabel={nb.name}
      recommendSections={recommendSections}
      favoritedLinks={favoritedLinks}
      aiCards={aiCards}
      hotDealCards={hotDealCards}
      isAdmin={me.is_admin}
    />
  );
}

// 피드 로딩 중 스켈레톤 — StoreFeedTabs 레이아웃(아이콘 행 + 헤더 + 카드 레일)에 맞춤.
// 첫 진입(캐시 미스)은 네이버 크롤링이라 수 초 걸릴 수 있어, 안내 문구로 대기 상태를 알린다.
function StoreFeedSkeleton() {
  return (
    <div>
      {/* 카테고리 아이콘 행 (펄스 플레이스홀더) */}
      <div className="flex animate-pulse gap-3 overflow-hidden pb-1" aria-hidden>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-full bg-zinc-200" />
            <div className="h-2.5 w-8 rounded bg-zinc-200" />
          </div>
        ))}
      </div>

      {/* 로딩 안내 — 스피너 + 문구 (✨ 맞춤 인트로 자리) */}
      <div
        className="mb-4 mt-6 flex items-center gap-2.5 text-brand"
        role="status"
        aria-live="polite"
      >
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
          aria-hidden
        />
        <p className="text-sm font-semibold">맞춤 추천 상품을 불러오고 있어요…</p>
      </div>

      {/* 카드 레일 2줄 (펄스 플레이스홀더) */}
      <div className="animate-pulse" aria-hidden>
        {Array.from({ length: 2 }).map((_, r) => (
          <section key={r} className="mb-7">
            <div className="mb-3 h-4 w-32 rounded bg-zinc-200" />
            <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-[15rem] shrink-0">
                  <div className="aspect-[4/3] w-full rounded-xl bg-zinc-200" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-zinc-200" />
                  <div className="mt-1.5 h-3 w-1/2 rounded bg-zinc-200" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
