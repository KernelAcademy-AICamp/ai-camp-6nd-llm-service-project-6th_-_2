import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServiceClient } from "@/lib/supabase/admin";

export type PlaceSuggestion = {
  name: string;
  description: string;
  lat: number;
  lng: number;
  walking_minutes: number;
  address?: string;
};

const KAKAO_LOCAL = "https://dapi.kakao.com/v2/local/search/keyword.json";

type Geocoded = {
  lat: number;
  lng: number;
  address: string;
  distance_m: number;
  matched_name: string;
};

// 카카오 로컬 검색 — 키워드로 1건 찾아서 좌표·주소·거리(중심 좌표 대비) 반환
async function geocodeByName(
  name: string,
  centerLat: number,
  centerLng: number,
  key: string,
): Promise<Geocoded | null> {
  const url = `${KAKAO_LOCAL}?query=${encodeURIComponent(name)}&x=${centerLng}&y=${centerLat}&radius=2000&size=1&sort=accuracy`;
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { documents?: any[] };
    const doc = j.documents?.[0];
    if (!doc) return null;
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      address: doc.road_address_name || doc.address_name || "",
      distance_m: parseInt(doc.distance ?? "0", 10),
      matched_name: doc.place_name,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { lat, lng } = (await req.json()) as { lat?: number; lng?: number };
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat/lng 필요" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const kakaoKey = process.env.KAKAO_REST_API_KEY;
    const apiKeyMissing =
      !apiKey || apiKey.startsWith("sk-ant-...") || apiKey === "your-key";
    const kakaoMissing = !kakaoKey || kakaoKey.startsWith("your-");

    if (apiKeyMissing || kakaoMissing) {
      // 폴백 — 시드된 pickup_locations 사용
      const sb = getServiceClient();
      const { data } = await sb
        .from("pickup_locations")
        .select("name, point, walk_minutes")
        .limit(3);
      const places: PlaceSuggestion[] = (data ?? []).map((p: any) => {
        const c = parseEwkbPoint(p.point);
        return {
          name: p.name,
          description: "시드 픽업 장소 (API 키 미설정 폴백)",
          lat: c?.lat ?? lat,
          lng: c?.lng ?? lng,
          walking_minutes: p.walk_minutes ?? 5,
        };
      });
      return NextResponse.json({ places, fallback: true });
    }

    const client = new Anthropic({ apiKey: apiKey! });
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    // 1단계: Claude로 검색 가능한 장소 이름 5개만 받음 (좌표는 카카오에서)
    const prompt = `다음 좌표 주변(서울)의 안전한 픽업 장소 후보를 정확히 5곳 추천해줘.
좌표: 위도 ${lat.toFixed(5)}, 경도 ${lng.toFixed(5)}

조건:
- CCTV·유동인구 많은 곳 (지하철역 출구, 편의점, 공원 정문, 카페, 패스트푸드점 등)
- 좌표로부터 도보 10분 이내
- 두 사람이 만나서 음식·물건을 주고받기 적합한 곳
- **카카오맵에서 검색하면 바로 찾을 수 있는 정확한 상호명·랜드마크명을 사용해.**
  좋은 예: "신림역 3번 출구", "GS25 신림역점", "보라매공원 정문", "스타벅스 신림점"
  나쁜 예: "근처 편의점", "역 앞 공원" (구체적 이름 없음 → 검색 불가)

JSON 배열로만 응답. 코드펜스·다른 설명 금지.
[
  {"name": "신림역 3번 출구", "description": "20자 이내 한줄 설명"},
  ...
]`;

    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end < 0) {
      return NextResponse.json({ error: "Claude 응답 파싱 실패", raw: text }, { status: 500 });
    }
    type Candidate = { name: string; description?: string };
    const candidates = (JSON.parse(cleaned.slice(start, end + 1)) as Candidate[]).filter(
      (c) => typeof c?.name === "string",
    );

    // 2단계: 각 이름을 카카오 로컬 검색으로 실제 좌표·주소·거리 변환 (병렬)
    const geocoded = await Promise.all(
      candidates.map((c) => geocodeByName(c.name, lat, lng, kakaoKey!)),
    );

    const places: PlaceSuggestion[] = [];
    candidates.forEach((c, i) => {
      const g = geocoded[i];
      if (!g) return; // 카카오에서 못 찾은 후보는 드롭
      places.push({
        name: g.matched_name || c.name,
        description: c.description ?? "",
        lat: g.lat,
        lng: g.lng,
        // 보행 80m/min 가정 (≈ 5km/h)
        walking_minutes: Math.max(1, Math.round(g.distance_m / 80)),
        address: g.address,
      });
    });

    // 가까운 순 정렬, 상위 3개
    places.sort((a, b) => a.walking_minutes - b.walking_minutes);
    return NextResponse.json({ places: places.slice(0, 3), fallback: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PostGIS EWKB hex → {lng, lat}. queries.ts와 동일 로직.
function parseEwkbPoint(hex: string | null): { lng: number; lat: number } | null {
  if (!hex || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 25) return null;
  const lng = buf.readDoubleLE(9);
  const lat = buf.readDoubleLE(17);
  return { lng, lat };
}
