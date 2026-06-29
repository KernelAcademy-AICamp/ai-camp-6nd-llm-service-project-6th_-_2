import { requireCurrentUser } from "@/lib/auth";
import { AddressPickerClient } from "@/components/AddressPickerClient";

export const dynamic = "force-dynamic";

// 가입 직후 거주지 설정 — 2단계 픽커(동네 → 건물).
// SKIP_ONBOARDING 은 챗봇 tour 만 우회. 거주지는 매칭에 필수라 항상 통과시킨다.
export default async function AddressOnboardingPage() {
  await requireCurrentUser();
  return <AddressPickerClient />;
}
