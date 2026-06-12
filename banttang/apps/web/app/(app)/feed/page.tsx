import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { listParties } from "@/lib/queries";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { tab?: string; sort?: string; view?: string; q?: string };
}) {
  const me = await requireCurrentUser();
  // 위치 설정 여부는 영속값(neighborhood_id)으로 판단 — 쿠키는 로그아웃 등으로 사라질 수 있다.
  if (!me.neighborhood_id) redirect("/onboarding/address");

  const sort = searchParams?.sort === "latest" ? "latest" : "deadline";
  const view = searchParams?.view === "map" ? "map" : "list";
  const parties = await listParties({
    statuses: ["recruiting"],
    forUserGender: me.gender,
    sort,
  });

  const tab = (searchParams?.tab === "shopping" ? "shopping" : "delivery") as
    | "delivery"
    | "shopping";

  // 카테고리 필터는 FeedClient에서 — 검색 시 카테고리 무관하게 통합 검색되도록.
  const recruiting = parties.filter((p) => p.display_status === "recruiting");

  const initialQuery = searchParams?.q ?? "";

  return (
    <FeedClient
      parties={recruiting}
      tab={tab}
      sort={sort}
      view={view}
      initialQuery={initialQuery}
    />
  );
}
