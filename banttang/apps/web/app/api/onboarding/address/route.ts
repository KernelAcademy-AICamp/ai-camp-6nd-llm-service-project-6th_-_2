import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";

type Region = { city: string; district: string; dong: string };

// 카카오 coord2regioncode는 시/도를 "서울"처럼 축약형으로 준다.
// neighborhoods 시드는 "서울특별시" 정식 표기를 쓰므로, 매칭(중복 row 방지)을 위해 정규화한다.
const CITY_NORMALIZE: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

function normalizeCity(city: string): string {
  return CITY_NORMALIZE[city.trim()] ?? city;
}

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

  // 좌표를 보냈는데 역지오코딩이 실패하면 동네(neighborhood_id)를 정할 수 없다.
  // 이때 조용히 성공 처리하면 매칭/모집글이 깨지므로, onboarding을 완료로 두지 않고 에러를 돌려준다.
  if (hasCoords && !region) {
    console.warn(
      "[onboarding/address] 역지오코딩 실패 — 동네 확정 불가 (KAKAO_REST_API_KEY/좌표 확인)",
    );
    return NextResponse.json(
      { ok: false, error: "위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // 표시용 주소: 현재위치는 역지오코딩 "구 동", 직접입력은 입력값 우선.
  const resolved =
    method === "current_location"
      ? region
        ? `${region.district} ${region.dong}`
        : "현재 위치"
      : address?.trim() || (region ? `${region.district} ${region.dong}` : "현재 위치");

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
      // 이 앱은 커스텀 쿠키(banttang_user_id)로 유저를 식별한다(getCurrentUser).
      // Supabase 세션(sb-*)은 항상 있는 게 아니므로 ssr.auth.getUser()로 찾으면
      // 세션이 없을 때 동네 갱신이 통째로 스킵된다 → 위치 설정해도 동네가 안 잡히는 버그.
      const me = await getCurrentUser();
      if (!me) {
        console.warn("[onboarding/address] 로그인 유저 없음 — 동네/프로필 갱신 스킵");
      } else {
        const admin = getServiceClient();
        // user_metadata는 기존 값을 보존해야 하므로 admin으로 조회해 머지한다.
        const { data: authData } = await admin.auth.admin.getUserById(me.id);
        const { error: metaErr } = await admin.auth.admin.updateUserById(me.id, {
          user_metadata: {
            ...(authData?.user?.user_metadata ?? {}),
            home: { lat, lng, address: resolved },
          },
        });
        if (metaErr) {
          console.error("[onboarding/address] user_metadata 갱신 실패:", metaErr);
        }

        // 동네 find-or-create → profiles.neighborhood_id 연결.
        // 미리 시드하지 않고, 유저가 고른 동네가 없으면 그때 생성(on-demand).
        // 위에서 hasCoords && !region이면 이미 반환했으므로 여기선 region이 보장된다.
        // city는 시드("서울특별시")와 동일 표기로 정규화해 중복 동네 row를 막는다.
        const { data: neighborhoodId, error: rpcErr } = await admin.rpc(
          "find_or_create_neighborhood",
          {
            p_city: normalizeCity((region as Region).city),
            p_district: (region as Region).district,
            p_name: (region as Region).dong,
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
            .eq("id", me.id);
          if (updErr) {
            console.error("[onboarding/address] profiles.neighborhood_id 갱신 실패:", updErr);
          } else if (isNaverConfigured()) {
            // 새 동네 피드를 백그라운드로 미리 데워둔다(스토어 첫 진입 지연 제거).
            // 응답을 막지 않는 fire-and-forget — 캐시 적중이면 0콜, 실패해도 스토어가 지연 로드로 폴백.
            void getNeighborhoodFeed({
              neighborhoodId: neighborhoodId as string,
              name: (region as Region).dong,
              district: (region as Region).district,
            }).catch((e) =>
              console.error("[onboarding/address] 동네 피드 프리워밍 실패:", e),
            );
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
