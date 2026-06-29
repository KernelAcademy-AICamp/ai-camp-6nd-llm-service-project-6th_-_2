import { cookies } from "next/headers";
import { ADDRESS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { WelcomeClient } from "@/components/onboarding/WelcomeClient";

export const dynamic = "force-dynamic";

// 거주지 등록 직후 노출되는 환영/첫 호스팅 유도 페이지.
// AddressPickerClient가 등록 성공 시 /onboarding/welcome 으로 push.
export default async function OnboardingWelcomePage() {
  await requireCurrentUser();
  const address = cookies().get(ADDRESS_COOKIE)?.value ?? null;
  return <WelcomeClient address={address} />;
}
