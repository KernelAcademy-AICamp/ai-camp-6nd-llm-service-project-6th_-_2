// 스토어 — 검색바 + 광고 배너 + 카테고리 아이콘 + 동네 맞춤 추천 피드.
// 혜택·쿠폰·청년 지원 정보 자리이며, 1단계로 네이버 검색 기반 추천 피드를 보여준다.
// (app) 레이아웃이 로그인을 보장 → 서버에서 직접 getNeighborhoodFeed 호출.

import Link from "next/link";
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
import { buildSearchQueries, ALL_INTERESTS, type FeedSection } from "@/lib/naver/query-builder";
import { StoreFeedTabs, type StoreSection } from "@/components/StoreFeedTabs";
import { StoreDebugQueries } from "@/components/StoreDebugQueries";
import { StoreRefreshButton } from "@/components/StoreRefreshButton";
import { StoreAdCarousel } from "@/components/StoreAdCarousel";
import { StoreSearchResults } from "@/components/StoreSearchResults";
import { ScrollToTop } from "@/components/ScrollToTop";
import type { StoreCardData } from "@/components/StoreCard";
import { personalizeSections, buildPersonalizedQueries } from "@/lib/naver/personalize";

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

// 검색바 — GET 폼. 입력 후 오른쪽 🔍 버튼 클릭(또는 Enter) 시 /store?q=... 로 이동.
function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/store" className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="상품 검색"
        className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 outline-none"
      />
      <button type="submit" aria-label="검색" className="shrink-0 text-zinc-400 transition hover:text-brand">
        🔍
      </button>
    </form>
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
    const [places, items] = await Promise.all([
      searchLocal(q, { display: 12 }).catch(() => []),
      searchShop(q, { display: 20 }).catch(() => []),
    ]);

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
        return {
          title: p.name,
          subtitle: [p.category, p.road_address || p.address].filter(Boolean).join(" · "),
          // 상세 주소는 빼고 상호명으로만 지도 검색.
          link: naverMapSearchUrl(p.name),
          image,
          banttangHref: `/host/new?${fp.toString()}`,
        };
      }),
    );
    // 쇼핑 → 카드: 가격·몰명, 클릭 시 로그인 게이트 없는 쇼핑 검색 리스트로.
    const shopCards: StoreCardData[] = items.map((it) => {
      const sp = new URLSearchParams({
        store: it.title,
        tab: "shopping",
        link: naverShoppingSearchUrl(it.title),
      });
      if (it.image) sp.set("image", it.image);
      return {
        title: it.title,
        subtitle: `${it.low_price.toLocaleString("ko-KR")}원 · ${it.mall_name}`,
        link: naverShoppingSearchUrl(it.title),
        image: it.image || null,
        // 쇼핑 결과 → 장보기 탭 + 쇼핑 링크 + 이미지 프리필
        banttangHref: `/host/new?${sp.toString()}`,
      };
    });

    return (
      <main className="flex flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-zinc-900">스토어</h1>
          <Link
            href="/store"
            aria-label="맞춤 추천으로 돌아가기"
            title="맞춤 추천으로 돌아가기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-brand"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        </div>

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
      "neighborhood_id, primary_usage, favorite_categories, neighborhoods(id, name, district)",
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

  let feed;
  try {
    const result = await getNeighborhoodFeed({
      neighborhoodId: nb.id,
      name: nb.name,
      district: nb.district,
    });
    feed = result.feed;
  } catch {
    return <EmptyState message={"추천을 불러오지 못했어요.\n잠시 후 다시 시도해 주세요."} />;
  }

  // market 은 동네명을 끼워 "{동네} 주변 마켓"으로 표기.
  const sectionTitle = (key: FeedSection) =>
    key === "market" ? `${nb.name} 주변 마켓` : SECTION_META[key].title;

  // 카테고리 아이콘은 항상 모두 노출 (비어도 탭 유지)
  const baseSections: StoreSection[] = SECTION_ORDER.map((key) => ({
    key,
    title: sectionTitle(key),
    shortLabel: SECTION_META[key].label,
    emoji: SECTION_META[key].emoji,
    cards: feed.sections[key] ?? [],
  }));

  const prefs = {
    primary_usage: profile?.primary_usage ?? null,
    favorite_categories: profile?.favorite_categories ?? [],
  };

  // 카테고리 탭 줄은 고정 순서(SECTION_ORDER) 유지 — 음식점 → 주변 마켓 → … 가 안정적으로 보이도록.
  // 개인화(섹션 순서/카드 가중치)는 ✨추천 탭(recommendSections)에만 적용한다.
  const sections = baseSections;

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

  // 맞춤 검색어로 추천 탭을 채운다(네이버 호출 → 동네+선호도 1시간 캐시).
  // 결과를 섹션 카드로 만들고 선호도 순서로 정렬, 카드 있는 섹션만.
  let recommendSections: StoreSection[] = [];
  try {
    const personalizedFeed = await getPersonalizedFeed(nb.id, personalizedQueries, nb.name);
    recommendSections = personalizeSections(
      SECTION_ORDER.map((key) => ({
        key,
        title: sectionTitle(key),
        shortLabel: SECTION_META[key].label,
        emoji: SECTION_META[key].emoji,
        cards: personalizedFeed[key] ?? [],
      })),
      prefs,
    ).filter((s) => s.cards.length > 0);
  } catch {
    // 맞춤 피드 실패 시 추천 탭은 동네 피드로 폴백(빈 배열 → StoreFeedTabs 폴백)
    recommendSections = [];
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-5">
      {/* 헤더 + 갱신 버튼 + 검색어 디버그(테스트용) */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-zinc-900">스토어</h1>
        <div className="flex items-center gap-2">
          <StoreRefreshButton />
          <StoreDebugQueries queries={debugQueries} personalizedQueries={personalizedQueries} />
        </div>
      </div>

      {/* 검색바 */}
      <SearchBar />

      {/* 광고 배너 슬라이드 — 좌우 여백 없이 꽉 채움(부모 px-4 상쇄) */}
      <div className="-mx-4">
        <StoreAdCarousel />
      </div>

      {/* 카테고리 아이콘 + 맞춤 정보 피드 */}
      <StoreFeedTabs
        sections={sections}
        userLabel={me.nickname}
        regionLabel={nb.name}
        recommendSections={recommendSections}
      />

      <ScrollToTop />
    </main>
  );
}
