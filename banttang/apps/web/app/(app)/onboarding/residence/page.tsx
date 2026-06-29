import { requireCurrentUser } from "@/lib/auth";
import { AddressPickerClient } from "@/components/AddressPickerClient";

export const dynamic = "force-dynamic";

// 회원가입 직후 거주지 설정 — 2단계 픽커(동네 → 건물).
// 홈에서 주소를 수정하는 /onboarding/address(AddressOnboardingClient)와는 별개 경로.
// 거주지는 매칭에 필수라 SKIP_ONBOARDING 우회 없이 항상 통과시킨다.
export default async function ResidenceOnboardingPage() {
  await requireCurrentUser();
  return <AddressPickerClient />;
}
