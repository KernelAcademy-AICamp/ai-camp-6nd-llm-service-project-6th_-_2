import { requireCurrentUser } from "@/lib/auth";
import { AddressOnboardingClient } from "@/components/AddressOnboardingClient";

export const dynamic = "force-dynamic";

// 홈 헤더의 주소를 눌렀을 때 쓰는 "위치 수정" 화면(rin 기존 화면).
// 회원가입 직후/거주지 미설정 가드가 보내는 /onboarding/address(강남·신림 픽커)와는 별개 경로.
export default async function AddressEditPage() {
  const me = await requireCurrentUser();
  return <AddressOnboardingClient userId={me.id} />;
}
