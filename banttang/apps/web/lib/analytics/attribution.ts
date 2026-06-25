// 채널 Attribution 트래킹 유틸 (PostHog + Supabase)
// 실험: SNS 채널 신규 가입자 확보 비교 (docs/experiments/attribution-sns-channel-test.md)
//
// 흐름: ad_click → landing_view(/signup) → signup_start → user_signed_up
// 모든 이벤트에 channel + utm_* 를 동일 스키마로 부착하고, 가입 시 profiles에 영속화한다.

import posthog from "posthog-js";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

const STORAGE_KEY = "banttang_attribution";

// utm_source/medium 조합 → 사람이 읽는 channel 라벨 (분석 단일 기준)
function resolveChannel(utm: UtmParams): string {
  const src = utm.utm_source ?? "";
  const content = utm.utm_content ?? "";
  if (src === "instagram") return "reels";
  if (src === "daangn") return "daangn_local";
  if (src === "kakao") return "kakao_ad";
  if (!src) return "direct";
  return `${src}_${content}` || src;
}

// 1) 랜딩(/signup) 진입 시 1회 호출 — UTM을 first-touch로 저장하고 landing_view 발화
export function captureLanding(search: string): UtmParams {
  const params = new URLSearchParams(search);
  const utm: UtmParams = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) utm[k] = v;
  }

  // first-touch 유지: 이미 저장된 attribution이 있으면 덮어쓰지 않는다
  const existing = readAttribution();
  const attribution = existing ?? { ...utm, channel: resolveChannel(utm) };
  if (!existing && typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  }

  // 익명 단계: PostHog person property로도 박아둔다 (가입 전 distinct_id에 귀속)
  posthog.register(attribution); // 이후 모든 이벤트에 자동 부착(super properties)
  posthog.capture("landing_view", { page: "/signup", ...attribution });
  return utm;
}

export function readAttribution():
  | (UtmParams & { channel: string })
  | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

// 2) CTA("지금 무료로 시작하기") 클릭 시
export function trackSignupStart() {
  posthog.capture("signup_start", readAttribution() ?? { channel: "direct" });
}

// 3) 가입 성공 직후 — distinct_id를 auth user와 병합하고 channel 영속화
export async function trackSignedUp(
  userId: string,
  persistToProfile: (channel: string, utm: UtmParams) => Promise<void>
) {
  const attr = readAttribution() ?? { channel: "direct" };
  posthog.identify(userId, attr); // 익명 → 가입 유저 alias 병합
  posthog.capture("user_signed_up", attr);

  // Supabase profiles.acquisition_channel 등에 영속화 (가입 품질 후속 분석용)
  const { channel, ...utm } = attr;
  await persistToProfile(channel, utm);
}
