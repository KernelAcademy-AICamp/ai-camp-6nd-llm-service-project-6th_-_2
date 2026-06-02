// 스토어 — 검색바 + 광고 배너 + 카테고리 아이콘 + 동네 맞춤 추천 피드.
// 혜택·쿠폰·청년 지원 정보 자리이며, 1단계로 네이버 검색 기반 추천 피드를 보여준다.
// (app) 레이아웃이 로그인을 보장 → 서버에서 직접 getNeighborhoodFeed 호출.

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed } from "@/lib/naver/cache";
import { isNaverConfigured, searchShop, naverShoppingSearchUrl } from "@/lib/naver/client";
import { buildSearchQueries, ALL_INTERESTS, type FeedSection } from "@/lib/naver/query-builder";
import { StoreFeedTabs, type StoreSection } from "@/components/StoreFeedTabs";
import { StoreDebugQueries } from "@/components/StoreDebugQueries";
import { StoreAdCarousel } from "@/components/StoreAdCarousel";
import { StoreCard } from "@/components/StoreCard";

export const dynamic = "force-dynamic";

const SECTION_META: Record<FeedSection, { emoji: string; label: string }> = {
  delivery: { emoji: "🛵", label: "배달" },
  food: { emoji: "🥗", label: "식품" },
  health: { emoji: "💊", label: "건강" },
  living: { emoji: "🛋️", label: "리빙" },
  beauty: { emoji: "💄", label: "뷰티" },
  fashion: { emoji: "👕", label: "패션" },
};
const SECTION_ORDER: FeedSection[] = [
  "delivery",
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

  // 검색 모드 — q 가 있으면 네이버 쇼핑 검색 결과를 보여준다 (동네 무관)
  const q = (searchParams.q ?? "").trim();
  if (q) {
    if (!isNaverConfigured()) {
      return <EmptyState message={"검색을 사용할 수 없어요."} />;
    }
    const items = await searchShop(q, { display: 20 }).catch(() => []);
    return (
      <main className="flex flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-zinc-900">스토어</h1>
          <Link href="/store" className="shrink-0 text-xs font-medium text-zinc-500 hover:text-brand">
            맞춤 추천 보기
          </Link>
        </div>

        <SearchBar defaultValue={q} />

        <h2 className="text-sm font-bold text-zinc-800">
          ‘{q}’ 상품 검색 결과 {items.length > 0 && `(${items.length})`}
        </h2>
        {items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <StoreCard
                key={it.product_id}
                title={it.title}
                subtitle={`${it.low_price.toLocaleString("ko-KR")}원 · ${it.mall_name}`}
                link={naverShoppingSearchUrl(it.title)}
                image={it.image || null}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
            검색 결과가 없어요.
          </p>
        )}
      </main>
    );
  }

  // 프로필의 동네 조회
  const sb = getServiceClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("neighborhood_id, neighborhoods(id, name, district)")
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

  // 카테고리 아이콘은 항상 6개 모두 노출 (비어도 탭 유지)
  const sections: StoreSection[] = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_META[key].label,
    shortLabel: SECTION_META[key].label,
    emoji: SECTION_META[key].emoji,
    cards: feed.sections[key] ?? [],
  }));

  // 테스트용 — 이 동네 프로필로 생성되는 추천 검색어 (네이버 호출에 쓰이는 그대로)
  const debugQueries = buildSearchQueries({
    neighborhood: { name: nb.name, district: nb.district },
    interests: ALL_INTERESTS,
  });

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-5">
      {/* 헤더 + 검색어 디버그(테스트용) */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-zinc-900">스토어</h1>
        <StoreDebugQueries queries={debugQueries} />
      </div>

      {/* 검색바 */}
      <SearchBar />

      {/* 광고 배너 슬라이드 */}
      <StoreAdCarousel />

      {/* 카테고리 아이콘 + 맞춤 정보 피드 */}
      <StoreFeedTabs sections={sections} userLabel={me.nickname} />
    </main>
  );
}
