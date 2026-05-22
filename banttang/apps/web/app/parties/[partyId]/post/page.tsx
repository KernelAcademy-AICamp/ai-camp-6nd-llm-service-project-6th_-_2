import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { KakaoMiniMap } from "@/components/chat/kakao-mini-map";
import { formatKrw } from "@/lib/utils";
import type { PartyStatus, PartyWithStats } from "@/lib/types/domain";

interface PageProps {
  params: { partyId: string };
}

const CATEGORY_LABEL: Record<PartyWithStats["category"], string> = {
  delivery: "배달",
  offline_shopping: "장보기",
  online_shopping: "온라인",
};

const STATUS_LABEL: Record<PartyStatus, { text: string; tone: string }> = {
  recruiting: { text: "모집중", tone: "bg-emerald-100 text-emerald-700" },
  closed: { text: "모집 완료", tone: "bg-amber-100 text-amber-700" },
  in_progress: { text: "거래 중", tone: "bg-sky-100 text-sky-700" },
  completed: { text: "거래 완료", tone: "bg-gray-100 text-gray-600" },
  cancelled: { text: "취소됨", tone: "bg-rose-100 text-rose-700" },
};

// 주문 목록 글 — 호스트가 작성한 파티 정보 전체 보기.
// PartyInfoCard의 chip 클릭으로 진입. 시간/장소 변경된 최신 값을 항상 반영.
export default async function PartyPostPage({ params }: PageProps) {
  const { partyId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/parties/${partyId}/post`);
  }

  const partyRes = await supabase
    .from("v_parties_with_stats")
    .select("*")
    .eq("id", partyId)
    .maybeSingle<PartyWithStats>();
  if (!partyRes.data) notFound();
  const party = partyRes.data;
  const partyExt = party as PartyWithStats & {
    pickup_location_id?: string | null;
    custom_pickup_name?: string | null;
    gender_option?: "all" | "same_gender";
  };

  // 픽업 정보 — 마스터 또는 custom
  let pickupName: string | null = null;
  let pickupCoords: { lat: number; lng: number } | null = null;
  if (partyExt.pickup_location_id) {
    const { data: loc } = await supabase
      .from("pickup_locations")
      .select("name, point")
      .eq("id", partyExt.pickup_location_id)
      .maybeSingle<{ name: string; point: unknown }>();
    pickupName = loc?.name ?? null;
    pickupCoords = parsePoint(loc?.point);
  } else if (partyExt.custom_pickup_name) {
    pickupName = partyExt.custom_pickup_name;
    // custom_pickup_point는 binary geography — RPC 없이 추출 어려워 생략.
  }

  const isHost = user.id === party.host_id;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/[0.06] bg-white/90 px-2 py-2.5 backdrop-blur">
        <Link
          href={`/parties/${partyId}`}
          aria-label="뒤로 가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="text-[16px] font-bold text-gray-900">주문글</h1>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {/* 1. 헤더 카드 — 가게, 메뉴, 카테고리 + 상태 */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[12px] font-semibold text-gray-500">
              {CATEGORY_LABEL[party.category]}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                STATUS_LABEL[party.status].tone
              }
            >
              {STATUS_LABEL[party.status].text}
            </span>
          </div>
          <p className="mt-1 text-[22px] font-bold text-gray-900">{party.store_name}</p>
          {party.representative_menu && (
            <p className="mt-1 text-[14px] text-gray-600">{party.representative_menu}</p>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-black/[0.06] pt-4">
            <Row label="예상 1인 금액">
              <span className="font-bold text-brand">
                {formatKrw(party.price_per_person)}
              </span>
            </Row>
            <Row label="정원">
              <span className="font-semibold tabular-nums">
                {party.approved_count}/{party.max_participants}명
              </span>
            </Row>
            <Row label="거래 시각">
              <DealTime dealAt={party.deal_at} />
            </Row>
            <Row label="신청 마감">
              <span className="text-gray-700">{formatKstShort(party.apply_deadline_at)}</span>
            </Row>
            <Row label="성별">
              <span className="text-gray-700">
                {partyExt.gender_option === "same_gender" ? "동성만" : "전체"}
              </span>
            </Row>
          </div>
        </section>

        {/* 2. 반띵 장소 카드 — 지도 + 핀 */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05]">
          <div className="flex items-baseline gap-2">
            <p className="text-[13px] font-bold text-gray-900">반띵 장소</p>
            <p className="text-[11px] text-gray-400">
              *주문에 참여하면 조정할 수 있어요.
            </p>
          </div>

          {pickupCoords ? (
            <div className="mt-3">
              <KakaoMiniMap lat={pickupCoords.lat} lng={pickupCoords.lng} title={pickupName ?? ""} />
            </div>
          ) : (
            <div className="mt-3 flex h-32 items-center justify-center rounded-xl bg-gray-50 text-[12px] text-gray-400">
              지도 정보 없음
            </div>
          )}

          {pickupName && (
            <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
              <span aria-hidden>📍</span>
              {pickupName}
            </p>
          )}
        </section>

        {/* 3. 호스트 카드 */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.05]">
          <p className="text-[13px] font-bold text-gray-900">호스트</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar nickname={party.host_nickname} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-gray-900">
                {party.host_nickname}
                {isHost && (
                  <span className="ml-1 text-[11px] font-normal text-brand">· 나</span>
                )}
              </p>
              <p className="text-[12px] text-gray-500">
                거래 {party.host_transaction_count}회 · {levelLabel(party.host_level)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function DealTime({ dealAt }: { dealAt: string }) {
  const date = new Date(dealAt);
  const utc = date.getTime();
  const k = new Date(utc + 9 * 60 * 60 * 1000);
  const m = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const h = k.getUTCHours();
  const min = k.getUTCMinutes();
  const datePart = `${pad2(m)}/${pad2(d)} ${pad2(h)}:${pad2(min)}`;
  const diff = utc - Date.now();
  const rel = relativeLabel(diff);
  return (
    <>
      <span className="font-semibold tabular-nums text-gray-900">{datePart}</span>
      {rel && <span className="ml-1 text-emerald-600">({rel})</span>}
    </>
  );
}

function relativeLabel(diffMs: number): string | null {
  if (diffMs <= 0) return null;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin > 0 ? `${hours}시간 ${remMin}분 후` : `${hours}시간 후`;
  const days = Math.floor(hours / 24);
  return `${days}일 후`;
}

function formatKstShort(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const m = k.getUTCMonth() + 1;
  const d = k.getUTCDate();
  const h = k.getUTCHours();
  const min = k.getUTCMinutes();
  return `${pad2(m)}/${pad2(d)} ${pad2(h)}:${pad2(min)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function levelLabel(l: string): string {
  if (l === "dandelion") return "민들레";
  if (l === "tree") return "나무";
  if (l === "king") return "왕대왕";
  return l;
}

// PostGIS geography 컬럼 → {lat, lng}. PostgREST는 보통 GeoJSON 또는 EWKT/WKB 텍스트로 반환.
// 두 케이스 모두 핸들링.
function parsePoint(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "coordinates" in value) {
    const c = (value as { coordinates?: [number, number] }).coordinates;
    if (Array.isArray(c) && c.length === 2) {
      return { lng: c[0], lat: c[1] };
    }
  }
  if (typeof value === "string") {
    // EWKT: "SRID=4326;POINT(lng lat)" or "POINT(lng lat)" or "0101000020..."(hex WKB).
    const m = value.match(/POINT\s*\(\s*([\-\d.]+)\s+([\-\d.]+)\s*\)/i);
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) };
  }
  return null;
}
