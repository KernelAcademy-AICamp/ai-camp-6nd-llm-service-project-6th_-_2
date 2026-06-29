import { redirect } from "next/navigation";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { shouldSkipOnboarding } from "@/lib/auth";

// 챗봇 온보딩 — 신규 가입 후 EmailLoginForm 이 /onboarding/tour 로 push.
// SKIP_ONBOARDING=true 면 즉시 /feed 로 떨궈 멀티 계정 테스트 흐름을 단축한다.
export default function OnboardingTourPage() {
  if (shouldSkipOnboarding()) {
    redirect("/feed");
  }
  return <OnboardingTour />;
}
