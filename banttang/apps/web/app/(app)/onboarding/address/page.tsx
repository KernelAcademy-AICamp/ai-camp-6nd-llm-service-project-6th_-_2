import { requireCurrentUser } from "@/lib/auth";
import { AddressPickerClient } from "@/components/AddressPickerClient";

export const dynamic = "force-dynamic";

// 거주지 설정 — 회원가입 직후/홈 주소수정 공통 진입점. 2단계 픽커(동네 🌿신림/🏙강남/🔎기타 → 건물).
// 앱 전역 가드(feed·community·parties·UserBar)가 모두 이 경로로 보내므로 거주지 UI는 여기 하나로 통일한다.
// 거주지는 매칭에 필수라 SKIP_ONBOARDING 우회 없이 항상 통과시킨다.
export default async function AddressOnboardingPage() {
  await requireCurrentUser();
  return <AddressPickerClient />;
}
