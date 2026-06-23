import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireCurrentUser, ADDRESS_COORDS_COOKIE } from "@/lib/auth";
import { listParties, parseEwkbPoint } from "@/lib/queries";
import { getServiceClient } from "@/lib/supabase/admin";
import { getAiPickRooms } from "@/lib/grocery-picks.server";
import type { PickRoom } from "@/lib/grocery-picks";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { sort?: string; view?: string; q?: string };
}) {
  const me = await requireCurrentUser();
  // 위치 설정 여부는 영속값(neighborhood_id)으로 판단 — 쿠키는 로그아웃 등으로 사라질 수 있다.
  if (!me.neighborhood_id) redirect("/onboarding/address");

  const sort = searchParams?.sort === "latest" ? "latest" : "deadline";
  // 기본값을 "지도"로 — 사용자가 명시적으로 ?view=list 줘야 주문별 보기.
  // 프로토타입(/prototype/v2)의 랜딩 경험과 동일하게 맞춤.
  const view = searchParams?.view === "list" ? "list" : "map";
  const parties = await listParties({
    statuses: ["recruiting"],
    forUserGender: me.gender,
    sort,
  });

  // 탭 구분 없이 장보기·배달 모집글을 통합 노출.
  const recruiting = parties.filter((p) => p.display_status === "recruiting");

  const initialQuery = searchParams?.q ?? "";

  // 추천 섹션 — 시스템 호스트가 만든 모집중(0/2) 방.
  const pickRooms: PickRoom[] = await getAiPickRooms().catch(() => []);

  // 거리 필터 기준점 — 1) 거주지 좌표 쿠키("lat,lng"), 없으면 2) 동네 중심 좌표 폴백.
  let userLat: number | null = null;
  let userLng: number | null = null;
  const coordsRaw = cookies().get(ADDRESS_COORDS_COOKIE)?.value;
  if (coordsRaw) {
    const [latStr, lngStr] = coordsRaw.split(",");
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      userLat = lat;
      userLng = lng;
    }
  }
  if (userLat === null) {
    const sb = getServiceClient();
    const { data: nb } = await sb
      .from("neighborhoods")
      .select("center_point")
      .eq("id", me.neighborhood_id)
      .maybeSingle();
    const c = parseEwkbPoint((nb as { center_point?: string } | null)?.center_point ?? null);
    if (c) {
      userLat = c.lat;
      userLng = c.lng;
    }
  }

  return (
    <FeedClient
      parties={recruiting}
      sort={sort}
      view={view}
      initialQuery={initialQuery}
      pickRooms={pickRooms}
      userLat={userLat}
      userLng={userLng}
    />
  );
}
