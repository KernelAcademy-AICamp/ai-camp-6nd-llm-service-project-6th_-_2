// 핫딜 크롤 — 커뮤니티 RSS + 정적 HTML 수집(헤드리스 없음, GET + 파싱).
//   docs/hotdeal-aggregator.md
//   리스크 최소화: 원문 링크백(detail_url), 제목·메타만 저장(본문 미저장).
//   소스 격리: 한 소스 실패가 전체를 막지 않게 try/catch per-source.
//
// 적용 소스:
//   · RSS  : 쿨엔조이, 루리웹
//   · HTML : 뽐뿌(국내, cp949), 퀘이사존
//   보류   : 뽐뿌 해외(딜·Q&A 혼재 노이즈), 클리앙(목록이 정적 HTML에 없음),
//            아카라이브(403 봇 차단) — 단순 GET 불가/품질 미달.

import "server-only";
import { parse as parseHtml } from "node-html-parser";

export type HotDealRow = {
  source_id: string;
  source_article_id: string;
  title: string;
  category: string | null;
  detail_url: string;
  posted_at: string | null;
  source_url: string | null; // 본문에서 추출한 실제 쇼핑몰 URL(없으면 null)
  thumbnail: string | null; // RSS 본문 첫 이미지(없으면 null)
};

type ParsedItem = Omit<HotDealRow, "source_id" | "source_url">;

type Source = {
  id: string;
  url: string;
  encoding?: string; // 지정 시 강제 디코딩(뽐뿌 cp949). 없으면 RSS는 선언 감지.
  parse: (text: string) => ParsedItem[];
  // 지정 시: 글 상세(detail_url)를 1회 더 fetch해 본문에서 출처 URL 추출.
  // RSS·목록엔 출처 URL이 없어 신규 글만 상세를 본다.
  detailSourceUrl?: (html: string) => string | null;
  detailEncoding?: string; // 상세 페이지 인코딩(미지정 시 utf-8)
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function fetchText(url: string, encoding?: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ko" },
    redirect: "follow",
    cache: "no-store",
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const enc =
    encoding ??
    new TextDecoder("ascii")
      .decode(buf.slice(0, 200))
      .toLowerCase()
      .match(/encoding=["']([\w-]+)["']/)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(enc).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

// ---- RSS ----
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function tagText(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return decodeEntities(v).trim() || null;
}
// RSS description 안의 첫 <img src> → 글 링크 기준 절대 URL 로 보정(없으면 null).
function firstImgSrc(description: string | null, link: string): string | null {
  const src = description?.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  if (!src) return null;
  try {
    return new URL(src, link).toString();
  } catch {
    return src.startsWith("http") ? src : null;
  }
}

function rssSource(id: string, url: string, articleId: (link: string) => string | null): Source {
  return {
    id,
    url,
    parse: (xml) => {
      const out: ParsedItem[] = [];
      for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
        const block = m[0];
        const title = tagText(block, "title");
        const link = tagText(block, "link");
        if (!title || !link) continue;
        const aid = articleId(link);
        if (!aid) continue;
        const posted = (() => {
          const p = tagText(block, "pubDate");
          if (!p) return null;
          const d = new Date(p);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        })();
        out.push({
          source_article_id: aid,
          title: title.slice(0, 300),
          category: tagText(block, "category")?.slice(0, 50) ?? null,
          detail_url: link,
          posted_at: posted,
          thumbnail: firstImgSrc(tagText(block, "description"), link),
        });
      }
      return out;
    },
  };
}

// ---- HTML (제목 앵커 기반) ----
function htmlAnchorSource(opts: {
  id: string;
  url: string;
  encoding?: string;
  selector: string; // 제목 a 셀렉터
  linkRe: RegExp; // href 매칭 → 그룹
  base: string; // 상대경로 보정용 origin
  articleId: (m: RegExpMatchArray) => string | null;
}): Source {
  return {
    id: opts.id,
    url: opts.url,
    encoding: opts.encoding,
    parse: (html) => {
      const root = parseHtml(html);
      const out: ParsedItem[] = [];
      for (const a of root.querySelectorAll(opts.selector)) {
        const rawHref = (a.getAttribute("href") || "").replace(/&amp;/g, "&");
        const m = rawHref.match(opts.linkRe);
        if (!m) continue;
        const aid = opts.articleId(m);
        if (!aid) continue;
        const title = (a.getAttribute("title") || a.text || "").trim();
        if (!title) continue;
        out.push({
          source_article_id: aid,
          title: title.slice(0, 300),
          category: null,
          detail_url: rawHref.startsWith("http") ? rawHref : opts.base + rawHref,
          posted_at: null, // HTML 목록엔 정확한 작성시각 없음 → read 에서 crawled_at 보조 정렬
          thumbnail: null, // HTML 목록 썸네일은 미추출(RSS 소스만 지원)
        });
      }
      return out;
    },
  };
}

const PPOMPPU_LINK = /view\.php\?id=(\w+)&(?:amp;)?no=(\d+)/;
const ppomppuArticleId = (m: RegExpMatchArray) => (m[1] === "notice" ? null : `${m[1]}_${m[2]}`);

// 루리웹 글 본문: <div class="source_url ..."><span>출처 : </span><a href="<몰 URL>">…
// 일부는 web.ruliweb.com/link.php?ol=<인코딩된 실제 URL> 래퍼라 실제 몰 URL로 푼다.
function ruliwebSourceUrl(html: string): string | null {
  const a = parseHtml(html).querySelector("div.source_url a[href]");
  let href = a?.getAttribute("href")?.trim();
  if (!href || !/^https?:\/\//i.test(href)) return null;
  const wrapped = href.match(/link\.php\?(?:[^#]*&)?ol=([^&]+)/i);
  if (wrapped) {
    try {
      const real = decodeURIComponent(wrapped[1]);
      if (/^https?:\/\//i.test(real)) href = real;
    } catch {
      /* 디코딩 실패 시 원본 래퍼 URL 유지 */
    }
  }
  return href;
}

const SOURCES: Source[] = [
  rssSource(
    "coolenjoy",
    "https://coolenjoy.net/bbs/rss.php?bo_table=jirum",
    (l) => l.match(/\/bbs\/\w+\/(\d+)/)?.[1] ?? null,
  ),
  {
    ...rssSource(
      "ruliweb",
      "https://bbs.ruliweb.com/market/board/1020/rss",
      (l) => l.match(/\/read\/(\d+)/)?.[1] ?? l.match(/(\d+)(?:[/?#]|$)/)?.[1] ?? null,
    ),
    detailSourceUrl: ruliwebSourceUrl,
  },
  htmlAnchorSource({
    id: "ppomppu",
    url: "https://www.ppomppu.co.kr/zboard/zboard.php?id=ppomppu",
    encoding: "euc-kr",
    selector: "a.baseList-title",
    linkRe: PPOMPPU_LINK,
    base: "https://www.ppomppu.co.kr",
    articleId: ppomppuArticleId,
  }),
  // 뽐뿌 해외(ppomppu4)는 딜과 Q&A 게시글이 섞여 노이즈가 커서 제외.
  htmlAnchorSource({
    id: "quasar",
    url: "https://quasarzone.com/bbs/qb_saleinfo",
    selector: "a.subject-link",
    linkRe: /\/bbs\/([\w_]+)\/views\/(\d+)/,
    base: "https://quasarzone.com",
    articleId: (m) => m[2],
  }),
];

// 이미 출처 URL을 가진 글 맵(key=`source:aid`)을 DB에서 로드.
// 상세 재fetch를 줄이기 위해 crawlHotDeals 에 넘긴다.
type KnownRow = { source_id: string; source_article_id: string; source_url: string | null };
type HotdealSelect = {
  from: (t: string) => {
    select: (c: string) => {
      not: (c: string, op: string, v: null) => PromiseLike<{ data: KnownRow[] | null }>;
    };
  };
};
export async function loadKnownSourceUrls(sb: HotdealSelect): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await sb
      .from("hotdeals")
      .select("source_id, source_article_id, source_url")
      .not("source_url", "is", null);
    for (const r of data ?? []) {
      if (r.source_url) map.set(`${r.source_id}:${r.source_article_id}`, r.source_url);
    }
  } catch (e) {
    console.error("[hotdeal] known source_url 로드 실패:", e);
  }
  return map;
}

const MAX_DETAIL_FETCH = 60; // 한 회차 상세 fetch 상한(소스 보호)
const DETAIL_CONCURRENCY = 4;

const dedupKey = (r: { source_id: string; source_article_id: string }) =>
  `${r.source_id}:${r.source_article_id}`;

/** thunk 배열을 동시성 제한으로 실행. */
async function mapLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 모든 소스를 수집·정규화·dedup 해서 upsert 행으로 반환.
 * @param knownSourceUrls 이미 DB에 source_url 이 있는 글 맵(key=`source:aid`).
 *   여기 있는 글은 상세 재fetch 없이 기존 값을 그대로 싣는다(소스 부하·중복 요청 방지).
 */
export async function crawlHotDeals(
  knownSourceUrls?: Map<string, string>,
): Promise<HotDealRow[]> {
  const rows: HotDealRow[] = [];
  // 상세 fetch가 필요한 항목(신규 글)을 모아 뒤에서 일괄 처리.
  const pending: Array<{ row: HotDealRow; src: Source }> = [];

  for (const src of SOURCES) {
    try {
      const text = await fetchText(src.url, src.encoding);
      for (const it of src.parse(text)) {
        const row: HotDealRow = { source_id: src.id, source_url: null, ...it };
        if (src.detailSourceUrl) {
          const known = knownSourceUrls?.get(dedupKey(row));
          if (known) row.source_url = known; // 이미 있음 → 재fetch 생략
          else pending.push({ row, src });
        }
        rows.push(row);
      }
    } catch (e) {
      console.error(`[hotdeal] ${src.id} 수집 실패:`, e);
    }
  }

  // dedup 먼저(같은 글 중복 제거 후 상세 fetch 낭비 방지).
  const seen = new Set<string>();
  const deduped = rows.filter((d) => {
    const k = dedupKey(d);
    return seen.has(k) ? false : (seen.add(k), true);
  });

  // 신규 글만 상세 1회 fetch → 본문에서 출처 URL 추출(상한·동시성 제한).
  const dedupedKeys = new Set(deduped.map(dedupKey));
  const toFetch = pending.filter((p) => dedupedKeys.has(dedupKey(p.row))).slice(0, MAX_DETAIL_FETCH);
  await mapLimit(
    toFetch.map(({ row, src }) => async () => {
      try {
        const html = await fetchText(row.detail_url, src.detailEncoding);
        row.source_url = src.detailSourceUrl!(html);
      } catch (e) {
        console.error(`[hotdeal] ${src.id} 상세 실패(${row.detail_url}):`, e);
      }
    }),
    DETAIL_CONCURRENCY,
  );

  return deduped;
}
