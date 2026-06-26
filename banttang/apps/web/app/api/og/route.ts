import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";

// 링크 OG(Open Graph) 프리뷰 메타 추출 — 채팅 메시지의 URL 썸네일 카드용.
// 보안:
//   - 로그인 사용자만 호출 가능(오픈 프록시 남용 방지)
//   - http/https만, 사설/로컬 호스트 차단(SSRF 방지)
//   - 응답 본문 크기 제한 + 타임아웃

export const dynamic = "force-dynamic";

const PRIVATE_HOST =
  /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|::1$|0\.0\.0\.0$|172\.(1[6-9]|2\d|3[0-1])\.)/i;

// 메타는 보통 head 앞쪽이지만, 유튜브처럼 head가 거대한 사이트는 og 태그가 600KB+ 뒤에 있음.
// 일반 사이트는 </head>에서 일찍 끊기므로 한도를 넉넉히(1.5MB) 잡아도 평소엔 낭비 없음.
const MAX_BYTES = 1536 * 1024;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// <meta property|name="key" content="..."> (속성 순서 무관)
function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
    // content가 property보다 앞에 오는 경우
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return null;
}

function absolutize(maybe: string | null, base: string): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

// 가격(정수)을 표시 문자열로. KRW/통화 미상이면 "30,000원", 그 외엔 "USD 30000".
function formatPrice(amount: number, currency?: string | null): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = (currency ?? "").toUpperCase();
  if (!cur || cur === "KRW" || cur === "WON") {
    return `${Math.round(amount).toLocaleString("ko-KR")}원`;
  }
  return `${cur} ${Math.round(amount).toLocaleString("ko-KR")}`;
}

type ProductInfo = { name?: string; image?: string; price?: string };

// JSON-LD(application/ld+json)에서 Product(이름/이미지/가격) 추출.
// 한국 쇼핑몰은 og 태그가 비어도 JSON-LD엔 상품 정보가 있는 경우가 많다.
function parseJsonLd(html: string): ProductInfo {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const b of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    // @graph / 배열 / 단일 노드 모두 평탄화해 순회
    const stack: unknown[] = Array.isArray(json) ? [...json] : [json];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) stack.push(...obj["@graph"]);

      const type = obj["@type"];
      const isProduct = Array.isArray(type)
        ? type.some((t) => String(t).toLowerCase() === "product")
        : String(type ?? "").toLowerCase() === "product";
      if (!isProduct) continue;

      const name = typeof obj.name === "string" ? decodeEntities(obj.name) : undefined;

      let image: string | undefined;
      const img = obj.image;
      if (typeof img === "string") image = img;
      else if (Array.isArray(img) && typeof img[0] === "string") image = img[0];
      else if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string")
        image = (img as Record<string, unknown>).url as string;

      let price: string | undefined;
      const offersRaw = obj.offers;
      const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
      if (offer && typeof offer === "object") {
        const o = offer as Record<string, unknown>;
        const amount = Number(o.price ?? o.lowPrice);
        const formatted = formatPrice(amount, o.priceCurrency as string | undefined);
        if (formatted) price = formatted;
      }

      if (name || image || price) return { name, image, price };
    }
  }
  return {};
}

// 네이버 쇼핑 검색 폴백 — OG/JSON-LD로 이미지를 못 구했을 때만.
// 키워드 검색이라 '정확히 그 상품'이 아닐 수 있어 source 라벨을 붙여 반환한다.
// 키(NAVER_CLIENT_ID/SECRET)가 없으면 비활성.
async function naverShoppingFallback(
  query: string,
): Promise<{ image: string; price: string | null } | null> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret || !query.trim()) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const u = new URL("https://openapi.naver.com/v1/search/shop.json");
    u.searchParams.set("query", query.slice(0, 80));
    u.searchParams.set("display", "1");
    u.searchParams.set("sort", "sim");
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { image?: string; lprice?: string }[];
    };
    const item = data.items?.[0];
    if (!item?.image) return null;
    const lprice = Number(item.lprice);
    return { image: item.image, price: formatPrice(lprice, "KRW") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "http(s) only" }, { status: 400 });
  }
  if (PRIVATE_HOST.test(target.hostname)) {
    return NextResponse.json({ error: "forbidden host" }, { status: 403 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(target.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // 일부 사이트는 봇 UA를 차단 → 일반 브라우저 UA로 위장
        "user-agent":
          "Mozilla/5.0 (compatible; BanttangBot/1.0; +https://banttang.app) AppleWebKit/537.36",
        accept: "text/html,application/xhtml+xml",
        // 한국 쇼핑몰이 지역별로 다른 마크업/가격을 줄 때 한국어 페이지를 받도록.
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      // HTML이 아니면(이미지 직링크 등) 메타 없음 → 빈 프리뷰
      return NextResponse.json(
        { url: res.url || target.toString() },
        { headers: { "cache-control": "private, max-age=86400" } },
      );
    }

    // 최대 MAX_BYTES만 읽기
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        // og:image가 이미 잡힌 일반 페이지는 </head>에서 일찍 끊어 대역폭 절약.
        // 쇼핑 페이지처럼 og:image가 없으면 본문의 JSON-LD까지 보려고 계속 읽는다.
        const headDone = /<\/head>/i.test(html) && /og:image/i.test(html);
        if (received >= MAX_BYTES || headDone) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    } else {
      html = await res.text();
    }

    const baseUrl = res.url || target.toString();
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const ogTitle = pickMeta(html, ["og:title", "twitter:title"]);
    const ogImage = absolutize(
      pickMeta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]),
      baseUrl,
    );
    const ogDesc = pickMeta(html, ["og:description", "twitter:description", "description"]);

    // 봇 차단/오류 페이지 거르기: OG 메타가 전혀 없고 <title>이 에러처럼 보이면 프리뷰 생략.
    const ERROR_TITLE =
      /에러|오류|error|access denied|forbidden|차단|robot|captcha|404|not found/i;
    const safeTitle =
      ogTitle ??
      (titleTag && !ERROR_TITLE.test(titleTag) ? decodeEntities(titleTag) : null);

    // 상품 정보 보강: JSON-LD Product + 가격 메타(og엔 가격이 없음).
    const ld = parseJsonLd(html);
    const metaPrice = formatPrice(
      Number(pickMeta(html, ["product:price:amount", "og:price:amount"])),
      pickMeta(html, ["product:price:currency", "og:price:currency"]),
    );

    let image = ogImage ?? absolutize(ld.image ?? null, baseUrl);
    let price = metaPrice ?? ld.price ?? null;
    const title = safeTitle ?? ld.name ?? null;
    let source: "og" | "naver_shopping" = "og";

    // 이미지를 끝내 못 구했으면(쇼핑몰 봇 차단 등) 네이버 쇼핑으로 폴백.
    // 키워드 검색이라 정확히 그 상품이 아닐 수 있어 라벨을 따로 둔다. (키 없으면 no-op)
    if (!image && title) {
      const nv = await naverShoppingFallback(title);
      if (nv) {
        image = nv.image;
        price = price ?? nv.price;
        source = "naver_shopping";
      }
    }

    // 보여줄 게 없으면 메타 없는 응답(클라이언트가 카드 미표시)
    const result = {
      url: baseUrl,
      title,
      description: ogDesc,
      image,
      price,
      source,
      siteName: pickMeta(html, ["og:site_name"]) ?? new URL(baseUrl).hostname,
    };

    // 메타가 있으면 길게, 빈 결과(차단/미지원)는 짧게 캐싱 — 일시적 차단이 오래 굳지 않게.
    const hasMeta = !!(result.title || result.description || result.image);
    return NextResponse.json(result, {
      headers: {
        "cache-control": hasMeta
          ? "private, max-age=86400"
          : "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
