import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatePartyForm } from "./create-party-form";

// 파티 생성 페이지 — 호스트가 모집글을 작성한다.
// 로그인 필수. 픽업 장소 옵션은 사용자의 neighborhood에서 가져온다.
export default async function NewPartyPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/parties/new");
  }

  // 프로필에서 neighborhood_id 조회. 없으면 동네 설정(온보딩)을 먼저 시킨다.
  const { data: profile } = await supabase
    .from("profiles")
    .select("neighborhood_id")
    .eq("id", user.id)
    .maybeSingle<{ neighborhood_id: string | null }>();
  if (!profile?.neighborhood_id) {
    redirect("/onboarding/address");
  }
  const neighborhoodId = profile.neighborhood_id;

  const { data: locs } = await supabase
    .from("pickup_locations")
    .select("id, name, walk_minutes")
    .eq("neighborhood_id", neighborhoodId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col">
      <CreatePartyForm pickupLocations={locs ?? []} />
    </main>
  );
}
