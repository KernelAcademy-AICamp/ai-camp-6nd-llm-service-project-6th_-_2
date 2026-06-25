"use server";

// 스토어 카드 클릭 로깅 — 클라이언트(StoreFeedTabs)에서 fire-and-forget 호출.
// 인증은 cookie 기반 getCurrentUser, 적재는 admin 클라이언트(다른 스토어 액션과 동일 패턴).
// subtitle 에서 가격을 뽑아 함께 적재(가성비 태그 입력).

import { getCurrentUser } from "@/lib/auth";
import { logUserEvent, parsePriceFromSubtitle } from "@/lib/store-events";

export async function logStoreClick(
  keyword: string,
  section?: string,
  subtitle?: string,
): Promise<void> {
  const me = await getCurrentUser();
  if (!me) return;
  await logUserEvent({
    userId: me.id,
    kind: "click",
    keyword,
    section: section ?? null,
    price: parsePriceFromSubtitle(subtitle),
  });
}
