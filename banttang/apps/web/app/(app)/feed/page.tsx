import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADDRESS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { listParties } from "@/lib/queries";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { tab?: string; sort?: string; view?: string };
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

  const filtered = parties.filter(
    (p) =>
      p.display_status === "recruiting" &&
      (tab === "delivery" ? p.category === "delivery" : p.category !== "delivery"),
  );

  return <FeedClient parties={filtered} tab={tab} sort={sort} view={view} />;
}
