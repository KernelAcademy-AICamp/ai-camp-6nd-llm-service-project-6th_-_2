import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { HostNewClient } from "@/components/HostNewClient";

export const dynamic = "force-dynamic";

const FALLBACK_COORDS = { lat: 37.4842, lng: 126.9296 }; // 신림역

export default async function HostNewPage() {
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
  return <HostNewClient userAddress={address} userCoords={coords} />;
}
