import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { HostNewClient } from "@/components/HostNewClient";

export const dynamic = "force-dynamic";

const FALLBACK_COORDS = { lat: 37.4842, lng: 126.9296 }; // 신림역

export default async function HostNewPage({
  searchParams,
}: {
  searchParams: { store?: string; tab?: string; link?: string; image?: string; price?: string };
}) {
  await requireCurrentUser();
  const c = cookies();
  const address = c.get(ADDRESS_COOKIE)?.value ?? null;
  const coordsStr = c.get(ADDRESS_COORDS_COOKIE)?.value;
  let coords = FALLBACK_COORDS;
  if (coordsStr) {
    const [latS, lngS] = coordsStr.split(",");
    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    if (!isNaN(lat) && !isNaN(lng)) coords = { lat, lng };
  }
  // 스토어 카드의 "반띵" 버튼에서 ?store=...&tab=...&link=... 로 프리필값을 넘겨받는다.
  const initialStoreName = searchParams.store?.trim() || undefined;
  const initialTab = searchParams.tab === "shopping" ? "shopping" : undefined;
  const initialLink = searchParams.link?.trim() || undefined;
  const initialImageUrl = searchParams.image?.trim() || undefined;
  const priceNum = Number(searchParams.price);
  const initialPrice =
    Number.isFinite(priceNum) && priceNum > 0 ? Math.floor(priceNum) : undefined;
  return (
    <HostNewClient
      userAddress={address}
      userCoords={coords}
      initialStoreName={initialStoreName}
      initialTab={initialTab}
      initialLink={initialLink}
      initialImageUrl={initialImageUrl}
      initialPrice={initialPrice}
    />
  );
}
