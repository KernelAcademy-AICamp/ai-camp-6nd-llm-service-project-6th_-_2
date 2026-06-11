import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADDRESS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { listParties } from "@/lib/queries";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { tab?: string; sort?: string; view?: string; q?: string };
}) {
  const me = await requireCurrentUser();
  if (!cookies().get(ADDRESS_COOKIE)) redirect("/onboarding/address");

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
