import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { CommunityWriteClient } from "@/components/CommunityWriteClient";

export const dynamic = "force-dynamic";

export default async function CommunityNewPage() {
  const me = await requireCurrentUser();
  // 동네 미설정이면 글을 쓸 수 없음
  if (!me.neighborhood_id) redirect("/onboarding/address");

  const sb = getServiceClient();
  const { data: nb } = await sb
    .from("neighborhoods")
    .select("name")
    .eq("id", me.neighborhood_id)
    .maybeSingle();

  return (
    <CommunityWriteClient
      neighborhoodName={(nb?.name as string | undefined) ?? null}
    />
  );
}
