import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE } from "@/lib/auth";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/admin";

type Region = { city: string; district: string; dong: string };

// 좌표 → (시, 구, 동) 역지오코딩 (카카오 coord2regioncode). 실패 시 null.
async function reverseGeocodeRegion(lat: number, lng: number): Promise<Region | null> {
  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) return null;
  try {
    const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      documents?: Array<{
        region_type?: string; // "B"=법정동, "H"=행정동
        region_1depth_name?: string; // 시/도
        region_2depth_name?: string; // 구
        region_3depth_name?: string; // 동
      }>;
    };
    const docs = json.documents ?? [];
    // 행정동(H) 우선 — 동네를 "역삼1동"처럼 더 잘게 쪼개서 매칭.
    // 행정동이 없으면 법정동(B)으로 폴백("역삼동").
    const doc =
      docs.find((d) => d.region_type === "H") ??
      docs.find((d) => d.region_type === "B") ??
      docs[0];
    if (!doc?.region_1depth_name || !doc?.region_2depth_name || !doc?.region_3depth_name) {
      return null;
    }
    return {
      city: doc.region_1depth_name,
      district: doc.region_2depth_name,
      dong: doc.region_3depth_name,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { method, address, lat, lng } = (await req.json()) as {
    method: "current_location" | "manual";
    address?: string;
    lat?: number;
    lng?: number;
  };

  const hasCoords = typeof lat === "number" && typeof lng === "number";

  // 좌표가 있으면 실제 (시,구,동)을 역지오코딩으로 확보한다.
  const region = hasCoords
    ? await reverseGeocodeRegion(lat as number, lng as number)
    : null;

  // 표시용 주소: 현재위치는 역지오코딩 "구 동", 직접입력은 입력값 우선.
  const resolved =
    method === "current_location"
      ? region
        ? `${region.district} ${region.dong}`
        : "현재 위치"
      : address?.trim() || (region ? `${region.district} ${region.dong}` : "신림동");

  cookies().set({
    name: ADDRESS_COOKIE,
    value: resolved,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  if (hasCoords) {
    cookies().set({
      name: ADDRESS_COORDS_COOKIE,
      value: `${lat},${lng}`,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // rin의 중간지점 추천(recommend-midpoint)이 auth.users.user_metadata.home를 읽으므로 같이 저장.
    // 갱신 실패는 onboarding 흐름 자체를 막지 않지만, 조용히 삼키면 디버깅이 불가능하므로 로그를 남긴다.
    try {
      const ssr = createSsrClient();
      const {
        data: { user },
      } = await ssr.auth.getUser();
      if (!user) {
        console.warn("[onboarding/address] 로그인 유저 없음 — 동네/프로필 갱신 스킵");
      } else {
        const admin = getServiceClient();
        const { error: metaErr } = await admin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...(user.user_metadata ?? {}),
            home: { lat, lng, address: resolved },
          },
        });
        if (metaErr) {
          console.error("[onboarding/address] user_metadata 갱신 실패:", metaErr);
        }

        // 동네 find-or-create → profiles.neighborhood_id 연결.
        // 미리 시드하지 않고, 유저가 고른 동네가 없으면 그때 생성(on-demand).
        if (!region) {
          console.warn(
            "[onboarding/address] region 역지오코딩 실패 — 동네/프로필 갱신 스킵 (KAKAO_REST_API_KEY 확인)",
          );
        } else {
          const { data: neighborhoodId, error: rpcErr } = await admin.rpc(
            "find_or_create_neighborhood",
            {
              p_city: region.city,
              p_district: region.district,
              p_name: region.dong,
              p_lat: lat,
              p_lng: lng,
            },
          );
          if (rpcErr) {
            console.error("[onboarding/address] find_or_create_neighborhood 실패:", rpcErr);
          } else if (neighborhoodId) {
            const { error: updErr } = await admin
              .from("profiles")
              .update({ neighborhood_id: neighborhoodId })
              .eq("id", user.id);
            if (updErr) {
              console.error("[onboarding/address] profiles.neighborhood_id 갱신 실패:", updErr);
            }
          }
        }
      }
    } catch (e) {
      // metadata/동네 갱신 실패는 onboarding 흐름 자체를 막지 않지만, 원인은 남긴다.
      console.error("[onboarding/address] 동네/프로필 갱신 중 예외:", e);
    }
  }
  return NextResponse.json({ ok: true, address: resolved });
}

// 주소만 초기화 — 사용자는 그대로 두고 위치 onboarding만 다시 띄울 때 사용 (데모용)
export async function DELETE() {
  cookies().delete(ADDRESS_COOKIE);
  cookies().delete(ADDRESS_COORDS_COOKIE);
  return NextResponse.json({ ok: true });
}
