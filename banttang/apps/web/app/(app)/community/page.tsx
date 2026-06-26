import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { listCommunityPosts } from "@/lib/community";
import { CommunityClient } from "@/components/CommunityClient";
import type { CommunityCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const CATS: CommunityCategory[] = ["free", "question", "share", "info", "meetup"];

export default async function CommunityPage({
  searchParams,
}: {
  searchParams?: { category?: string; scope?: string };
}) {
  const me = await requireCurrentUser();

  // 동네 미설정 — 글을 읽으려면 먼저 동네 설정 필요
  if (!me.neighborhood_id) {
    return (
      <CommunityClient
        posts={[]}
        neighborhoodName={null}
        category={null}
        scope="all"
        residence={null}
      />
    );
  }

  const sb = getServiceClient();
  const { data: nb } = await sb
    .from("neighborhoods")
    .select("name")
    .eq("id", me.neighborhood_id)
    .maybeSingle();

  const category = CATS.includes(searchParams?.category as CommunityCategory)
    ? (searchParams?.category as CommunityCategory)
    : undefined;

  // 거주지 탭 — residence가 있을 때만 유효. 없으면 전체글로 폴백.
  const scope: "all" | "residence" =
    searchParams?.scope === "residence" && me.residence ? "residence" : "all";

  const posts = await listCommunityPosts({
    neighborhoodId: me.neighborhood_id,
    viewerId: me.id,
    category,
    residence: scope === "residence" ? me.residence! : undefined,
  });

  return (
    <CommunityClient
      posts={posts}
      neighborhoodName={(nb?.name as string | undefined) ?? null}
      category={category ?? null}
      scope={scope}
      residence={me.residence ?? null}
    />
  );
}
