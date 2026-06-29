// 후기 태그 단일 소스 — 작성 폼(ReviewDetailClient)과 후기 표시(ReviewsTabs)가 공유.
// 표시 화면에서 text_review 의 앞부분이 "선택 태그"인지 판별(ALL_REVIEW_TAGS)해 색을 입힌다.

// 파티장을 평가할 때 — 멤버 시점 (운영·매너)
export const HOST_GOOD_TAGS = [
  "거래 약속을 잘 지켜요",
  "친절하고 매너가 좋아요",
  "제가 있는 곳까지 와서 거래했어요",
  "응답이 빨라요",
];
export const HOST_BAD_TAGS = [
  "약속 시간을 안 지켰어요",
  "응답이 느려요",
  "무례하게 행동해요",
  "약속 장소에 나오지 않았어요",
];

// 파티원을 평가할 때 — 파티장 시점 (정산·참여 태도)
export const MEMBER_GOOD_TAGS = [
  "정산을 정확히 했어요",
  "약속 시간을 잘 지켰어요",
  "친절하고 매너가 좋아요",
  "응답이 빨라요",
  "픽업 후 깔끔하게 마무리했어요",
];
export const MEMBER_BAD_TAGS = [
  "정산을 미루거나 안 했어요",
  "약속 시간을 안 지켰어요",
  "무례하게 행동해요",
  "응답이 느려요",
  "약속 장소에 나오지 않았어요",
];

// 표시용 — 모든 태그 집합(저장된 text_review 의 앞부분이 태그인지 판별).
export const ALL_REVIEW_TAGS = new Set<string>([
  ...HOST_GOOD_TAGS,
  ...HOST_BAD_TAGS,
  ...MEMBER_GOOD_TAGS,
  ...MEMBER_BAD_TAGS,
]);

// 저장 포맷: "태그1, 태그2\n\n자유 텍스트" (태그 없으면 자유 텍스트만, 자유 텍스트 없으면 태그만).
// 앞 세그먼트의 콤마 분리 항목이 전부 알려진 태그면 "선택 태그"로 본다.
export function splitReviewText(text: string): {
  tags: string[];
  freeText: string;
} {
  const parts = text.split("\n\n");
  const firstItems = (parts[0] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isTagLine =
    firstItems.length > 0 && firstItems.every((t) => ALL_REVIEW_TAGS.has(t));
  if (isTagLine) {
    return { tags: firstItems, freeText: parts.slice(1).join("\n\n").trim() };
  }
  return { tags: [], freeText: text };
}
