import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getCommunityPost, listComments } from "@/lib/community";
import { CommunityPostClient } from "@/components/CommunityPostClient";

export const dynamic = "force-dynamic";

export default async function CommunityPostPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireCurrentUser();

  const post = await getCommunityPost(params.id, me.neighborhood_id, me.id);
  // 글이 없거나 다른 동네 글이면 노출하지 않음 (같은 동네만 접근)
  if (!post) notFound();

  const [comments, nb] = await Promise.all([
    listComments(post.id, me.id),
    getServiceClient()
      .from("neighborhoods")
      .select("name")
      .eq("id", post.neighborhood_id)
      .maybeSingle(),
  ]);

  return (
    <CommunityPostClient
      post={post}
      comments={comments}
      meId={me.id}
      neighborhoodName={(nb.data?.name as string | undefined) ?? null}
    />
  );
}
