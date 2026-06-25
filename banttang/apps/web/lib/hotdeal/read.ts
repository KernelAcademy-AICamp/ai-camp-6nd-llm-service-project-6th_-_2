// 핫딜 읽기 — hotdeals 테이블을 스토어 핫딜 탭 카드로 변환.
//   원문 커뮤니티로 링크아웃(detail_url). 없으면 빈 배열.
//   docs/hotdeal-aggregator.md

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreCardData } from "@/components/StoreCard";

const SOURCE_LABEL: Record<string, string> = {
  coolenjoy: "쿨엔조이",
  ruliweb: "루리웹",
  ppomppu: "뽐뿌",
  quasar: "퀘이사존",
};

// 제목 맨 앞 대괄호 토큰에서 "쇼핑몰 출처"를 뽑는다.
// 루리웹·뽐뿌·쿨엔조이는 "[지마켓] 상품…"처럼 출처를 프리픽스로 단다.
// 단 [품절]·[종료] 같은 상태, [게임H/W] 같은 분류 토큰은 출처가 아니다.
// 퀘이사존의 대괄호는 쇼핑몰이 아니라 게시판 카테고리라 통째로 제외한다.
const NON_MALL =
  /^(품절|종료|마감|완료|재입고|정보|예약|예판|핫딜|이벤트|쿠폰|게임\s*h\/?w|게임\s*s\/?w|h\/?w|s\/?w|기타|기프티콘)$/i;

function extractMall(title: string, sourceId: string): string | null {
  if (sourceId === "quasar") return null;
  // 맨 앞에서 연속된 [..] 토큰을 순서대로 보며 첫 '쇼핑몰' 후보를 채택.
  // 예: "[네이버][품절]…" → 네이버,  "[게임H/W] [겜우리]…" → 겜우리
  let rest = title.trimStart();
  for (let i = 0; i < 3; i++) {
    const m = rest.match(/^\[\s*([^\]]{1,20}?)\s*\]\s*/);
    if (!m) return null;
    const tok = m[1].trim();
    rest = rest.slice(m[0].length);
    if (tok && !NON_MALL.test(tok)) return tok;
  }
  return null;
}

// 출처 URL → 표시용 호스트(www. 제거). 파싱 실패 시 null.
function sourceHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type Row = {
  title: string;
  category: string | null;
  detail_url: string;
  source_id: string;
  source_url: string | null;
  thumbnail: string | null;
};

export async function getHotDealCards(limit = 20): Promise<StoreCardData[]> {
  const res = await createAdminClient()
    .from("hotdeals")
    .select("title, category, detail_url, source_id, source_url, thumbnail")
    .eq("is_ended", false)
    // 작성시각(RSS) 우선 최신순, 없는 HTML 항목은 뒤로 → 수집시각 보조.
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("crawled_at", { ascending: false })
    .limit(limit)
    .then((r: { data: unknown }) => r)
    .catch(() => ({ data: null }));

  const rows = (res.data ?? []) as Row[];
  return rows
    // 루리웹은 출처(쇼핑몰) URL이 없는 글은 제외 — 본문 추출 실패/출처 없는 글.
    .filter((r) => !(r.source_id === "ruliweb" && !r.source_url))
    .map((r) => {
    // 출처 표시: 제목 프리픽스 쇼핑몰명(친근) 우선, 없으면 출처 URL 호스트.
    const origin = extractMall(r.title, r.source_id) ?? sourceHost(r.source_url);
    return {
      title: r.title,
      subtitle: [SOURCE_LABEL[r.source_id] ?? r.source_id, origin, r.category]
        .filter(Boolean)
        .join(" · "),
      // 출처 URL이 있으면 실제 쇼핑몰로 바로 연결, 없으면 원문 커뮤니티 글로.
      link: r.source_url ?? r.detail_url,
      image: r.thumbnail, // RSS 본문 썸네일(없으면 null → 기본 썸네일)
    };
  });
}
