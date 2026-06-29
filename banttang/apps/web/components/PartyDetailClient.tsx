"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./StatusBadge";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import {
  categoryLabel,
  formatKRW,
  formatKstShort,
  minutesUntil,
} from "@/lib/party-status";
import { PartyPhotosGallery } from "./PartyPhotosGallery";
import { pushRecentViewed } from "./SearchPageClient";
import type { DisplayStatus, PartyRow } from "@/lib/types";

type Member = {
  user_id: string;
  status: string;
  is_host: boolean;
  nickname: string;
  level: "dandelion" | "tree" | "king";
};

type Props = {
  me: { id: string; nickname: string };
  party: PartyRow & {
    occupied_count: number;
    display_status: DisplayStatus;
    pickup_name: string | null;
    pickup_lat: number | null;
    pickup_lng: number | null;
  };
  members: Member[];
};

export function PartyDetailClient({ me, party, members }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 호스트가 방금 글 생성하고 진입한 경우만 "확인" 노출 (?created=1).
  const justCreated = searchParams?.get("created") === "1";
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [showHostAccept, setShowHostAccept] = useState(false);

  // 진입 시 localStorage에 "최근 본 목록" 저장 — /feed/search에서 노출됨.
  useEffect(() => {
    pushRecentViewed({
      id: party.id,
      store_name: party.store_name,
      photo_path: party.photo_paths?.[0] ?? null,
      representative_menu: party.representative_menu ?? null,
    });
  }, [party.id, party.store_name, party.photo_paths, party.representative_menu]);

  // 실시간 인원 카운트 — 누가 신청/승인/취소되면 즉시 SSR 재계산.
  // 호스트 화면에서 새 신청 즉시 보이고, 다른 사용자 화면에서도 정원 마감 반영.
  // party_participants와 parties.status 두 테이블 모두 구독.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`party-detail:${party.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_participants", filter: `party_id=eq.${party.id}` },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${party.id}` },
          () => router.refresh(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, party.id, router]);

  const isHost = me.id === party.host_id;
  const myMembership = members.find((m) => m.user_id === me.id);
  const occupied = party.occupied_count;
  const isFull = occupied >= party.max_participants;
  const allPendingFilled =
    party.status === "recruiting" &&
    isFull &&
    members.some((m) => m.status === "pending");

  async function call(path: string, body?: any) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "오류");
        return null;
      }
      return j;
    } finally {
      setBusy(false);
    }
  }

  async function doJoin() {
    setShowJoinConfirm(false);
    const r = await call(`/api/parties/${party.id}/join`);
    if (r) {
      if (r.waitingForHost) alert("파티장 수락 대기 중입니다. 알림을 보냈어요.");
      router.refresh();
    }
  }
  async function doApprove() {
    setShowHostAccept(false);
    const r = await call(`/api/parties/${party.id}/approve`);
    if (r) {
      router.push(`/chat/${party.id}`);
      router.refresh();
    }
  }
  async function doCancel() {
    if (!confirm("이 주문을 취소할까요? 참여자에게 알림이 갑니다.")) return;
    const r = await call(`/api/parties/${party.id}/cancel`);
    if (r) router.push("/mypage");
  }
  async function doLeave() {
    if (!confirm("이 주문에서 나가시겠어요?")) return;
    const r = await call(`/api/parties/${party.id}/leave`);
    if (r) router.push("/feed");
  }
  async function doKick(uid: string, nickname: string) {
    if (!confirm(`${nickname} 님을 내보낼까요?`)) return;
    const r = await call(`/api/parties/${party.id}/leave`, { targetUserId: uid });
    if (r) router.refresh();
  }

  const min = minutesUntil(party.deal_at);
  const remainText =
    min > 60
      ? `${Math.floor(min / 60)}시간 ${min % 60}분 후`
      : min > 0
        ? `${min}분 후`
        : "거래시간 지남";

  const chatExists = party.status === "closed" || party.status === "in_progress" || party.status === "completed";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* "← 뒤로"는 글로벌 헤더(UserBar subpage 모드)가 처리 — 여기선 노출 X. */}

      {/* 상품 사진 — 호스트가 등록한 1~10장. 썸네일 작게 + 탭하면 풀스크린 프리뷰. */}
      {party.photo_paths && party.photo_paths.length > 0 && (
        <PartyPhotosGallery paths={party.photo_paths} alt={party.store_name} />
      )}

      {/* 헤더 카드 — 미트볼은 글로벌 헤더(UserBar subpage 모드)로 이동했음 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-400">{categoryLabel[party.category]}</span>
          <StatusBadge status={party.display_status} />
        </div>
        <h1 className="mt-1 text-xl font-bold">{party.store_name}</h1>
        {party.representative_menu && (
          <MenuOrLink text={party.representative_menu} />
        )}

        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-400">예상 1인 금액</dt>
          <dd className="text-right font-medium">{formatKRW(party.price_per_person)}</dd>
          <dt className="text-zinc-400">정원</dt>
          <dd className="text-right">{occupied}/{party.max_participants}명</dd>
          <dt className="text-zinc-400">거래 시각</dt>
          <dd className="text-right">
            {formatKstShort(party.deal_at)}{" "}
            <span className="text-brand">({remainText})</span>
          </dd>
          <dt className="text-zinc-400">신청 마감</dt>
          <dd className="text-right">{formatKstShort(party.apply_deadline_at)}</dd>
          <dt className="text-zinc-400">성별</dt>
          <dd className="text-right">{party.gender_option === "all" ? "성별 무관" : "동성만"}</dd>
        </dl>
      </section>

      {/* 위치 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-zinc-700">반띵 장소</h3>
          <span className="text-[11px] text-zinc-400">
            *주문에 참여하면 조정할 수 있어요.
          </span>
        </div>
        <PickupMap lat={party.pickup_lat} lng={party.pickup_lng} name={party.pickup_name} />
        <p className="mt-2 text-sm">📍 {party.pickup_name ?? "미정"}</p>
      </section>

      {/* 멤버 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-zinc-700">파티원</h3>
        <ul className="space-y-2">
          {members
            .filter((m) => m.status !== "cancelled" && m.status !== "rejected")
            .map((m) => (
              <li key={m.user_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{m.is_host ? "👑" : "🌱"}</span>
                  <span className="font-medium">{m.nickname}</span>
                  {m.status === "pending" && (
                    <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">
                      신청
                    </span>
                  )}
                  {m.user_id === me.id && (
                    <span className="text-[10px] text-brand">(나)</span>
                  )}
                </div>
                {isHost && !m.is_host && (party.status === "recruiting" || party.status === "closed") && (
                  <button
                    onClick={() => doKick(m.user_id, m.nickname)}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    내보내기
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>

      {/* 액션 */}
      <section className="flex flex-col gap-2">
        {isHost && allPendingFilled && (
          <button
            onClick={() => setShowHostAccept(true)}
            disabled={busy}
            className="rounded-xl bg-brand py-3 font-semibold text-white shadow-sm"
          >
            파티원 모두 모였어요 — 주문 진행하기
          </button>
        )}
        {isHost && chatExists && (
          <Link
            href={`/chat/${party.id}` as any}
            className="rounded-xl bg-brand py-3 text-center font-semibold text-white"
          >
            채팅방 열기
          </Link>
        )}
        {/* 호스트 삭제/수정은 헤더 우측 미트볼 메뉴로 이동. */}
        {!isHost && !myMembership && party.status === "recruiting" && (
          <button
            onClick={() => setShowJoinConfirm(true)}
            disabled={busy || isFull}
            className="rounded-xl bg-brand py-3 font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {isFull ? "정원이 다 찼어요" : "참여 신청하기"}
          </button>
        )}
        {!isHost && myMembership?.status === "pending" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700">
            파티장의 수락을 기다리는 중이에요…
          </div>
        )}
        {!isHost && myMembership && chatExists && (
          <Link
            href={`/chat/${party.id}` as any}
            className="rounded-xl bg-brand py-3 text-center font-semibold text-white"
          >
            채팅방 열기
          </Link>
        )}
        {!isHost && myMembership && (party.status === "recruiting" || party.status === "closed") && (
          <button
            onClick={doLeave}
            disabled={busy}
            className="rounded-xl border border-zinc-200 py-3 text-zinc-600"
          >
            참여 취소
          </button>
        )}
        {/* 호스트가 방금 생성하고 들어온 직후 한 번만 — 인라인 회색 버튼. */}
        {isHost && justCreated && (
          <Link
            href="/feed"
            className="rounded-xl border border-zinc-200 py-3 text-center font-semibold text-zinc-600 active:bg-zinc-50"
          >
            확인
          </Link>
        )}
      </section>

      {/* 참여 확인 모달 */}
      {showJoinConfirm && (
        <Modal onClose={() => setShowJoinConfirm(false)}>
          <h3 className="text-lg font-semibold">참여 확인</h3>
          <div className="mt-3 space-y-1 text-sm text-zinc-600">
            <p>📦 {party.store_name}</p>
            {party.representative_menu && (
              <div>
                · <MenuOrLink text={party.representative_menu} />
              </div>
            )}
            <p>💸 예상 1인 {formatKRW(party.price_per_person)}</p>
            <p>📍 {party.pickup_name ?? "미정"}</p>
            <p>🕒 {formatKstShort(party.deal_at)}</p>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            확인 누르면 파티장에게 신청 알림이 갑니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowJoinConfirm(false)}
              className="flex-1 rounded-xl border border-zinc-200 py-2"
            >
              취소
            </button>
            <button onClick={doJoin} className="flex-1 rounded-xl bg-brand py-2 text-white">
              확인
            </button>
          </div>
        </Modal>
      )}

      {/* 호스트 수락 모달 */}
      {showHostAccept && (
        <Modal onClose={() => setShowHostAccept(false)}>
          <h3 className="text-lg font-semibold">파티원이 모두 모였어요</h3>
          <p className="mt-2 text-sm text-zinc-600">
            주문을 진행할까요? 수락하면 모든 파티원과의 채팅방이 자동으로 열립니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowHostAccept(false)}
              className="flex-1 rounded-xl border border-zinc-200 py-2"
            >
              다음에
            </button>
            <button onClick={doApprove} className="flex-1 rounded-xl bg-brand py-2 text-white">
              수락
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

// 대표 메뉴/링크 — URL이면 도메인 표기 + 새 탭 링크, 아니면 일반 텍스트.
function MenuOrLink({ text }: { text: string }) {
  const trimmed = text.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  if (!isUrl) {
    return <p className="text-sm text-zinc-500">{trimmed}</p>;
  }
  let host = trimmed;
  try {
    host = new URL(trimmed).host.replace(/^www\./, "");
  } catch {
    // URL 파싱 실패 시 원본 사용
  }
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200"
      title={trimmed}
    >
      <span aria-hidden>🔗</span>
      <span className="truncate">{host}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function PickupMap({
  lat,
  lng,
  name,
}: {
  lat: number | null;
  lng: number | null;
  name: string | null;
}) {
  const sdk = useKakaoSdk();
  const mapEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sdk.status !== "ready" || !mapEl.current || !window.kakao?.maps?.Map) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const k = window.kakao;
    const pos = new k.maps.LatLng(lat, lng);
    const map = new k.maps.Map(mapEl.current, { center: pos, level: 4 });
    map.setDraggable(false);
    map.setZoomable(false);
    new k.maps.Marker({ position: pos, map });
    // 가게/장소명 말풍선
    const html = `<div class="banttang-bubble"><div class="banttang-bubble__title">${(name ?? "픽업 장소").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)}</div><div class="banttang-bubble__tail"></div></div>`;
    new k.maps.CustomOverlay({
      position: pos,
      content: html,
      yAnchor: 1.6,
    }).setMap(map);
  }, [sdk.status, lat, lng, name]);

  if (typeof lat !== "number" || typeof lng !== "number") {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        좌표 정보가 없는 장소
      </div>
    );
  }
  if (sdk.status !== "ready") {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        지도 로딩 중…
      </div>
    );
  }
  return <div ref={mapEl} className="h-40 w-full overflow-hidden rounded-xl border border-zinc-200" />;
}

