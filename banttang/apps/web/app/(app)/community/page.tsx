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
  searchParams?: { category?: string };
}) {
  const me = await requireCurrentUser();

  // 동네 미설정 — 글을 읽으려면 먼저 동네 설정 필요
  if (!me.neighborhood_id) {
    return (
      <CommunityClient posts={[]} neighborhoodName={null} category={null} />
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

  const posts = await listCommunityPosts({
    neighborhoodId: me.neighborhood_id,
    viewerId: me.id,
    category,
  });

  return (
    <CommunityClient
      posts={posts}
      neighborhoodName={(nb?.name as string | undefined) ?? null}
      category={category ?? null}
    />
  );
}
