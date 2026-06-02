// 네이버 검색 API 래퍼
// https://developers.naver.com/docs/serviceapi/search/
//
// 추천 서비스의 외부 데이터 소스. 동네별 검색어로 호출 → 결과를 정규화해 반환한다.
// 인증: 애플리케이션 등록 후 받은 Client ID/Secret 을 헤더로 전달.
//   X-Naver-Client-Id / X-Naver-Client-Secret
//
// 검색 종류 (추천 피드 매핑):
//   - local : 지역검색 (배달 맛집 — 좌표·주소 포함)
//   - shop  : 쇼핑검색 (장보기·생활템 — 가격 포함)
//   - blog  : 블로그검색 (동네 소식)
//   - news  : 뉴스검색 (동네 소식)
//
// ⚠ 네이버 응답은 그대로 신뢰하지 말 것 — Zod 로 검증하고, title/description 의
//   HTML 태그(<b>)·엔티티(&amp; 등)는 strip 한다.

// 서버 전용 — 클라이언트 컴포넌트가 import 하면 빌드 실패시켜 시크릿 노출 차단.
import "server-only";
import { z } from "zod";

const NAVER_BASE = "https://openapi.naver.com/v1/search";

// 검색 종류별 정렬 옵션 (네이버 스펙)
export type LocalSort = "random" | "comment"; // 정확도순 / 리뷰순
export type ShopSort = "sim" | "date" | "asc" | "dsc"; // 정확도 / 날짜 / 가격↑ / 가격↓
export type DocSort = "sim" | "date"; // 블로그·뉴스 공통

// ---------- 에러 타입 ----------

/** 키 미설정 등 설정 문제. 폴백으로 분기할 때 instanceof 로 구분. */
export class NaverConfigError extends Error {
  constructor(message = "네이버 검색 API 키(NAVER_CLIENT_ID/SECRET)가 설정되지 않았습니다") {
    super(message);
    this.name = "NaverConfigError";
  }
}

/** 네이버가 4xx/5xx 를 반환했을 때. */
export class NaverApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`네이버 검색 API 오류 (${status}): ${body.slice(0, 200)}`);
    this.name = "NaverApiError";
  }
}

// ---------- 자격 증명 ----------

function getCredentials(): { id: string; secret: string } | null {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  const missing =
    !id ||
    !secret ||
    id.startsWith("your-") ||
    secret.startsWith("your-");
  if (missing) return null;
  return { id, secret };
}

/** 키가 설정돼 호출 가능한지. 라우터에서 폴백 분기용. */
export function isNaverConfigured(): boolean {
  return getCredentials() !== null;
}

// ---------- HTML strip ----------

// 네이버는 검색어 일치 부분을 <b>...</b> 로 감싸고 일부 엔티티를 인코딩해 보낸다.
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m] ?? m)
    .trim();
}

// ---------- 공통 fetch ----------

type CommonParams = {
  query: string;
  display?: number;
  start?: number;
  sort?: string;
};

// 429(rate limit)·5xx 는 일시적이므로 지수 백오프로 재시도.
const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function naverFetch(
  type: "local" | "shop" | "blog" | "news",
  params: CommonParams,
): Promise<unknown> {
  const cred = getCredentials();
  if (!cred) throw new NaverConfigError();

  const qs = new URLSearchParams();
  qs.set("query", params.query);
  if (params.display != null) qs.set("display", String(params.display));
  if (params.start != null) qs.set("start", String(params.start));
  if (params.sort != null) qs.set("sort", params.sort);
  const url = `${NAVER_BASE}/${type}.json?${qs.toString()}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": cred.id,
        "X-Naver-Client-Secret": cred.secret,
      },
      // 동네별 캐시는 우리 DB 에서 관리 — fetch 캐시는 끈다.
      cache: "no-store",
    });

    if (res.ok) return res.json();

    // 일시적 오류면 백오프 후 재시도 (300ms, 800ms, 1800ms …)
    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt < MAX_RETRIES) {
      await sleep(300 * Math.pow(2.4, attempt));
      continue;
    }
    throw new NaverApiError(res.status, await res.text());
  }
}

// 검색 종류별 응답 봉투. items 만 종류별로 다름.
function envelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    lastBuildDate: z.string(),
    total: z.number(),
    start: z.number(),
    display: z.number(),
    items: z.array(item),
  });
}

// ---------- 지역검색 (local) ----------

const LocalItemRaw = z.object({
  title: z.string(),
  link: z.string(),
  category: z.string(),
  description: z.string(),
  telephone: z.string(),
  address: z.string(),
  roadAddress: z.string(),
  mapx: z.string(),
  mapy: z.string(),
});

export type NaverLocalPlace = {
  name: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  road_address: string;
  // 좌표는 (latitude, longitude) 순서로 노출 (프로젝트 컨벤션)
  lat: number;
  lng: number;
};

// 네이버 지역검색 mapx/mapy 는 WGS84 경위도를 10^7 배 한 정수 문자열.
function toWgs84(v: string): number {
  return parseInt(v, 10) / 1e7;
}

export type LocalSearchOptions = {
  display?: number; // 1~5
  start?: number; // 1
  sort?: LocalSort;
};

/** 지역검색 — 배달 맛집 등 좌표가 있는 장소. */
export async function searchLocal(
  query: string,
  opts: LocalSearchOptions = {},
): Promise<NaverLocalPlace[]> {
  const raw = await naverFetch("local", {
    query,
    display: opts.display ?? 5,
    start: opts.start,
    sort: opts.sort ?? "random",
  });
  const parsed = envelope(LocalItemRaw).parse(raw);
  return parsed.items.map((it) => ({
    name: stripHtml(it.title),
    link: it.link,
    category: it.category,
    description: stripHtml(it.description),
    telephone: it.telephone,
    address: it.address,
    road_address: it.roadAddress,
    lat: toWgs84(it.mapy),
    lng: toWgs84(it.mapx),
  }));
}

// ---------- 쇼핑검색 (shop) ----------

const ShopItemRaw = z.object({
  title: z.string(),
  link: z.string(),
  image: z.string(),
  lprice: z.string(),
  hprice: z.string(),
  mallName: z.string(),
  productId: z.string(),
  productType: z.string(),
  brand: z.string(),
  maker: z.string(),
  category1: z.string(),
  category2: z.string(),
  category3: z.string(),
  category4: z.string(),
});

export type NaverShopItem = {
  title: string;
  link: string;
  image: string;
  low_price: number;
  high_price: number | null;
  mall_name: string;
  product_id: string;
  brand: string;
  maker: string;
  // category1~4 를 / 로 합친 분류 경로
  category: string;
};

export type ShopSearchOptions = {
  display?: number; // 1~100
  start?: number; // 1~1000
  sort?: ShopSort;
};

// 네이버 쇼핑 검색 URL. 쇼핑 상품 딥링크(smartstore·catalog)는 재클릭 시
// nid.naver.com 로그인 게이트로 튕기므로, 카드 클릭은 로그인 없는 쇼핑 검색 리스트로 보낸다.
export function naverShoppingSearchUrl(query: string): string {
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`;
}

/** 쇼핑검색 — 장보기·생활템 (가격 포함). */
export async function searchShop(
  query: string,
  opts: ShopSearchOptions = {},
): Promise<NaverShopItem[]> {
  const raw = await naverFetch("shop", {
    query,
    display: opts.display ?? 10,
    start: opts.start,
    sort: opts.sort ?? "sim",
  });
  const parsed = envelope(ShopItemRaw).parse(raw);
  return parsed.items.map((it) => ({
    title: stripHtml(it.title),
    link: it.link,
    image: it.image,
    low_price: parseInt(it.lprice, 10) || 0,
    high_price: it.hprice ? parseInt(it.hprice, 10) || null : null,
    mall_name: it.mallName,
    product_id: it.productId,
    brand: it.brand,
    maker: it.maker,
    category: [it.category1, it.category2, it.category3, it.category4]
      .filter(Boolean)
      .join(" / "),
  }));
}

// ---------- 블로그검색 (blog) ----------

const BlogItemRaw = z.object({
  title: z.string(),
  link: z.string(),
  description: z.string(),
  bloggername: z.string(),
  bloggerlink: z.string(),
  postdate: z.string(),
});

export type NaverBlogPost = {
  title: string;
  link: string;
  description: string;
  blogger_name: string;
  blogger_link: string;
  post_date: string; // YYYYMMDD
};

export type DocSearchOptions = {
  display?: number; // 1~100
  start?: number; // 1~1000
  sort?: DocSort;
};

/** 블로그검색 — 동네 소식. */
export async function searchBlog(
  query: string,
  opts: DocSearchOptions = {},
): Promise<NaverBlogPost[]> {
  const raw = await naverFetch("blog", {
    query,
    display: opts.display ?? 10,
    start: opts.start,
    sort: opts.sort ?? "sim",
  });
  const parsed = envelope(BlogItemRaw).parse(raw);
  return parsed.items.map((it) => ({
    title: stripHtml(it.title),
    link: it.link,
    description: stripHtml(it.description),
    blogger_name: it.bloggername,
    blogger_link: it.bloggerlink,
    post_date: it.postdate,
  }));
}

// ---------- 뉴스검색 (news) ----------

const NewsItemRaw = z.object({
  title: z.string(),
  originallink: z.string(),
  link: z.string(),
  description: z.string(),
  pubDate: z.string(),
});

export type NaverNewsArticle = {
  title: string;
  link: string;
  original_link: string;
  description: string;
  pub_date: string; // RFC 1123
};

/** 뉴스검색 — 동네 소식. */
export async function searchNews(
  query: string,
  opts: DocSearchOptions = {},
): Promise<NaverNewsArticle[]> {
  const raw = await naverFetch("news", {
    query,
    display: opts.display ?? 10,
    start: opts.start,
    sort: opts.sort ?? "sim",
  });
  const parsed = envelope(NewsItemRaw).parse(raw);
  return parsed.items.map((it) => ({
    title: stripHtml(it.title),
    link: it.link,
    original_link: it.originallink,
    description: stripHtml(it.description),
    pub_date: it.pubDate,
  }));
}
