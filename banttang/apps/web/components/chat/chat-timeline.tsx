"use client";

import { Fragment, useState, type RefObject } from "react";
import type { ChatItem } from "@/lib/types/chat";
import { cn, formatKstDateLabel, formatKstTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ReceiptCardMessage } from "./receipt-card-message";
import { KakaoMiniMap } from "./kakao-mini-map";

interface Props {
  items: ChatItem[];
  currentUserId: string;
  isHost: boolean;
  participantCount: number;
  // 현재 채팅방 모든 멤버 user_id (안읽은 수 계산용)
  memberUserIds: string[];
  // user_id → 마지막으로 읽은 메시지 ISO 시각 (Presence로 동기화).
  reads: Record<string, string>;
  scrollAnchorRef: RefObject<HTMLDivElement>;
  // 호스트가 중간지점 추천을 picky로 채택할 때 호출.
  onChangePickup?: (input: {
    name: string;
    lat: number;
    lng: number;
  }) => Promise<void> | void;
  // 호스트가 "그대로 둘게요" 선택 시 호출 — messageId 전달.
  onDismissMidpoint?: (messageId: string) => Promise<void> | void;
  // 띵동 시스템 메시지의 "내 거래 카드보기" 버튼을 누를 때.
  onOpenTransactionCard?: () => void;
}

// 같은 날짜인지 비교 (KST 기준 YYYY-MM-DD)
function sameKstDay(aIso: string, bIso: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(aIso)) === fmt.format(new Date(bIso));
}

export function ChatTimeline({
  items,
  currentUserId,
  isHost,
  participantCount,
  memberUserIds,
  reads,
  scrollAnchorRef,
  onChangePickup,
  onDismissMidpoint,
  onOpenTransactionCard,
}: Props) {
  // 메시지 하나의 안읽은 수 — 보낸이 외 멤버 중 last_read_at < 메시지 created_at 인 사람 수
  function unreadCountFor(message: { sender_id: string | null; created_at: string }): number {
    const msgMs = new Date(message.created_at).getTime();
    let count = 0;
    for (const uid of memberUserIds) {
      if (uid === message.sender_id) continue;
      const rt = reads[uid];
      const readMs = rt ? new Date(rt).getTime() : 0;
      if (readMs < msgMs) count += 1;
    }
    return count;
  }
  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f6f8] px-4 py-4">
      {items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium text-gray-700">첫 메시지를 남겨보세요</p>
          <p className="text-xs text-gray-400">참여자들과 거래 약속을 잡아보세요.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => {
            const prev = items[i - 1];
            const next = items[i + 1];
            const showDate = !prev || !sameKstDay(prev.at, item.at);

            const dateNode = showDate ? (
              <li key={`date-${item.at}`} className="my-3 flex justify-center">
                <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-medium text-gray-500">
                  {formatKstDateLabel(item.at)}
                </span>
              </li>
            ) : null;

            if (item.kind === "receipt") {
              return (
                <Fragment key={`r-${item.data.id}`}>
                  {dateNode}
                  <li>
                    <ReceiptCardMessage
                      receipt={item.data}
                      participantCount={participantCount}
                    />
                  </li>
                </Fragment>
              );
            }

            const m = item.data;
            const isSystem = m.type === "system" || m.sender_id === null;

            if (isSystem) {
              // 수신자 제한: metadata.recipient 값에 따라 표시 대상 분기.
              //   'host'   → 호스트 + 발신자 본인 (다른 멤버에겐 숨김)
              //   'member' → 멤버만 (호스트에겐 숨김)
              //   그 외/미지정 → 전원 표시
              const recipient = (m.metadata as { recipient?: string } | null)?.recipient;
              const metaSenderId = (m.metadata as { sender_id?: string } | null)?.sender_id;
              const isMineSystem = metaSenderId === currentUserId;
              if (recipient === "host" && !isHost && !isMineSystem) {
                return null;
              }
              if (recipient === "member" && isHost) {
                return null;
              }

              // 중간지점 추천은 카드 형태로 별도 렌더
              if (isMidpointRecommendation(m.metadata)) {
                const messageId = m.id;
                return (
                  <Fragment key={`m-${messageId}`}>
                    {dateNode}
                    <li>
                      <MidpointCard
                        meta={m.metadata as unknown as MidpointMeta}
                        isHost={isHost}
                        onChangePickup={onChangePickup}
                        onDismiss={
                          onDismissMidpoint
                            ? () => onDismissMidpoint(messageId)
                            : undefined
                        }
                      />
                    </li>
                  </Fragment>
                );
              }

              // 띵동 — viewer 입장에 따라 문구 분기:
              //   본인이 보낸 띵동(참여자): 호스트 OO에게 "띵동" 했어요
              //   본인이 보낸 띵동(호스트): 모두에게 "띵동" 했어요
              //   다른 사람이 보낸 띵동:    OO님이 "띵동" 했어요!
              if (isDoorbellRing(m.metadata)) {
                const meta = m.metadata as {
                  sender_id?: string;
                  sender_nickname?: string;
                  sender_role?: "host" | "participant";
                  host_nickname?: string | null;
                };
                const mineDoorbell = meta.sender_id === currentUserId;
                let displayText: string;
                if (mineDoorbell) {
                  if (meta.sender_role === "host") {
                    displayText = `모두에게 "띵동" 했어요`;
                  } else {
                    const hostNick = meta.host_nickname ?? "호스트";
                    displayText = `호스트 ${hostNick}에게 "띵동" 했어요`;
                  }
                } else {
                  const nick = meta.sender_nickname ?? "참여자";
                  displayText = `${nick}님이 "띵동" 했어요!`;
                }
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li>
                      <DoorbellCard
                        content={displayText}
                        mine={mineDoorbell}
                        onOpenCard={onOpenTransactionCard}
                      />
                    </li>
                  </Fragment>
                );
              }

              // 픽업 장소 변경 안내 카드 — 지도 + 핀
              if (isPickupChanged(m.metadata)) {
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li>
                      <PickupChangedCard meta={m.metadata as unknown as PickupChangedMeta} />
                    </li>
                  </Fragment>
                );
              }

              // 영수증 확인 요청 — 강조 카드(amber).
              const meta = m.metadata as { kind?: string; title?: string } | null;
              if (meta?.kind === "receipt_confirm_prompt") {
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li className="my-2 flex justify-center px-4">
                      <div className="w-full max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-[13px] font-bold text-amber-900">
                          📋 {meta.title ?? "주문 내역 및 금액이 일치하는지 확인해 주세요."}
                        </p>
                      </div>
                    </li>
                  </Fragment>
                );
              }

              // party_closed (DB trigger가 INSERT) — 새 spec copy로 override
              const displayContent =
                m.system_event === "party_closed"
                  ? "반띵 채팅방이 열렸어요. 서로 인사를 나눠보세요 👋"
                  : m.content;
              return (
                <Fragment key={`m-${m.id}`}>
                  {dateNode}
                  <li className="my-1 flex justify-center">
                    <span className="rounded-full bg-black/[0.05] px-3 py-1.5 text-[11px] text-gray-500">
                      {displayContent}
                    </span>
                  </li>
                </Fragment>
              );
            }

            const mine = m.sender_id === currentUserId;
            const prevIsSameSender =
              prev &&
              prev.kind === "message" &&
              prev.data.sender_id === m.sender_id &&
              prev.data.type !== "system" &&
              sameKstDay(prev.at, item.at);
            const nextIsSameSender =
              next &&
              next.kind === "message" &&
              next.data.sender_id === m.sender_id &&
              next.data.type !== "system" &&
              sameKstDay(next.at, item.at);
            const sameMinuteAsNext =
              nextIsSameSender &&
              next!.kind === "message" &&
              formatKstTime(next!.data.created_at) === formatKstTime(m.created_at);

            const showHeader = !mine && !prevIsSameSender;
            // 같은 분 내 연속 메시지는 시간 생략, 그룹의 마지막 또는 분이 바뀌면 노출
            const showTime = !sameMinuteAsNext;

            return (
              <Fragment key={`m-${m.id}`}>
                {dateNode}
                <li
                  className={cn(
                    "flex flex-col",
                    mine ? "items-end" : "items-start",
                    showHeader ? "mt-3" : "mt-0.5",
                  )}
                >
                  {showHeader && (
                    <div className="mb-1 ml-9 flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-gray-700">
                        {m.sender?.nickname ?? "알 수 없음"}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex max-w-[80%] items-end gap-1.5",
                      mine ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    {/* 상대 메시지 아바타: 그룹의 첫 메시지에만 노출, 나머지는 자리 비움 */}
                    {!mine && (
                      <span className="w-7 shrink-0">
                        {!prevIsSameSender && (
                          <Avatar nickname={m.sender?.nickname ?? "?"} size={28} />
                        )}
                      </span>
                    )}

                    {isImageMessage(m.metadata) ? (
                      <ImageBubble
                        meta={m.metadata as unknown as ImageMeta}
                        mine={mine}
                        prevIsSameSender={!!prevIsSameSender}
                        nextIsSameSender={!!nextIsSameSender}
                      />
                    ) : (
                      <div
                        className={cn(
                          "whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed",
                          mine
                            ? "bg-brand text-brand-foreground"
                            : "bg-white text-gray-900 ring-1 ring-black/[0.04]",
                          mine
                            ? cn(
                                "rounded-2xl",
                                !prevIsSameSender && "rounded-tr-md",
                                !nextIsSameSender && "rounded-br-md",
                              )
                            : cn(
                                "rounded-2xl",
                                !prevIsSameSender && "rounded-tl-md",
                                !nextIsSameSender && "rounded-bl-md",
                              ),
                        )}
                      >
                        {m.content}
                      </div>
                    )}

                    <div
                      className={cn(
                        "mb-0.5 flex shrink-0 flex-col text-[10px] leading-none",
                        mine ? "items-end" : "items-start",
                      )}
                    >
                      {(() => {
                        const unread = unreadCountFor(m);
                        return unread > 0 ? (
                          <span className="font-bold text-amber-500 tabular-nums">
                            {unread}
                          </span>
                        ) : null;
                      })()}
                      {showTime && (
                        <time className="mt-0.5 text-gray-400">
                          {formatKstTime(m.created_at)}
                        </time>
                      )}
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
      <div ref={scrollAnchorRef} />
    </div>
  );
}

// ---- 중간지점 추천 카드 ----
// chat_messages.metadata에 { kind: "midpoint_recommendation", place_name, category, address, distance_m, participants[] }로 저장됨.

interface MidpointMeta {
  kind: "midpoint_recommendation";
  place_name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distance_m: number;
  place_url?: string;
  participants?: { nickname: string; address?: string | null }[];
  // 호스트가 결정 후 metadata에 영구 저장. 채팅방 재진입 시 버튼 대신 결과 상태를 보여줌.
  decided?: "confirmed" | "dismissed" | null;
}

function isMidpointRecommendation(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return (
    !!meta &&
    (meta as { kind?: unknown }).kind === "midpoint_recommendation" &&
    typeof (meta as { place_name?: unknown }).place_name === "string"
  );
}

function MidpointCard({
  meta,
  isHost,
  onChangePickup,
  onDismiss,
}: {
  meta: MidpointMeta;
  isHost: boolean;
  onChangePickup?: (input: { name: string; lat: number; lng: number }) => Promise<void> | void;
  onDismiss?: () => Promise<void> | void;
}) {
  return (
    <div className="my-3 flex w-full justify-center">
      <article className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
        <header className="flex items-center gap-1.5 bg-brand/[0.08] px-4 py-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
          <span className="text-[12px] font-bold text-brand">중간지점 추천</span>
          <span className="ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
            호스트에게만 보여요
          </span>
        </header>

        <div className="px-4 pb-4 pt-3">
          <p className="text-[14px] leading-relaxed text-gray-900">
            다 같이 모이기 좋은 중간 지점은{" "}
            <span className="font-bold text-brand">'{meta.place_name}'</span>이에요.
          </p>
          <p className="mt-1 text-[12px] text-gray-500">이곳으로 반띵 장소를 변경하시겠어요?</p>

          <p className="mt-3 text-[12px] text-gray-500">
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {meta.category}
            </span>
            <span className="ml-1.5">{meta.address}</span>
          </p>

          {/* 임베드 카카오맵 — 핀이 추천 장소 */}
          <div className="mt-3">
            <KakaoMiniMap
              lat={meta.lat}
              lng={meta.lng}
              title={meta.place_name}
            />
          </div>

          {isHost && (
            <MidpointActions
              initialDecision={meta.decided ?? null}
              onConfirm={
                onChangePickup
                  ? () =>
                      onChangePickup({
                        name: meta.place_name,
                        lat: meta.lat,
                        lng: meta.lng,
                      })
                  : undefined
              }
              onDismiss={onDismiss}
            />
          )}
        </div>
      </article>
    </div>
  );
}

// 호스트용 결정 액션. 결정은 metadata에 영구 저장(`initialDecision`)되어
// 채팅방 재진입 시에도 같은 상태를 유지한다.
type MidpointDecision = "confirmed" | "dismissed" | null;

function MidpointActions({
  initialDecision,
  onConfirm,
  onDismiss,
}: {
  initialDecision: MidpointDecision;
  onConfirm?: () => Promise<void> | void;
  onDismiss?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);

  async function handleConfirm() {
    if (busy || initialDecision || !onConfirm) return;
    setBusy("confirm");
    try {
      await onConfirm();
    } finally {
      setBusy(null);
    }
  }
  async function handleDismiss() {
    if (busy || initialDecision || !onDismiss) return;
    setBusy("dismiss");
    try {
      await onDismiss();
    } finally {
      setBusy(null);
    }
  }

  if (initialDecision === "confirmed") {
    return (
      <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-[12px] font-semibold text-emerald-700">
        반띵 장소가 변경됐어요
      </p>
    );
  }
  if (initialDecision === "dismissed") {
    return (
      <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-center text-[12px] text-gray-500">
        현재 장소를 그대로 유지해요
      </p>
    );
  }
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={handleDismiss}
        disabled={busy !== null || !onDismiss}
        className="h-11 flex-1 rounded-xl bg-gray-100 text-[14px] font-semibold text-gray-700 transition-colors active:bg-gray-200 disabled:opacity-50"
      >
        {busy === "dismiss" ? "처리 중…" : "그대로 둘게요"}
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy !== null || !onConfirm}
        className={cn(
          "h-11 flex-[2] rounded-xl text-[14px] font-bold transition-opacity",
          "bg-brand text-white active:opacity-80",
          busy === "confirm" && "opacity-70",
        )}
      >
        {busy === "confirm" ? "변경 중…" : "장소 변경하기"}
      </button>
    </div>
  );
}

// ---- 픽업 장소 변경 안내 카드 ----
// chat_messages.metadata에 { kind: "pickup_changed", name, lat, lng, address? }로 저장됨.

interface PickupChangedMeta {
  kind: "pickup_changed";
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
}

function isPickupChanged(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return (
    !!meta &&
    (meta as { kind?: unknown }).kind === "pickup_changed" &&
    typeof (meta as { name?: unknown }).name === "string" &&
    typeof (meta as { lat?: unknown }).lat === "number" &&
    typeof (meta as { lng?: unknown }).lng === "number"
  );
}

function PickupChangedCard({ meta }: { meta: PickupChangedMeta }) {
  return (
    <div className="my-3 flex w-full justify-center">
      <article className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
        <header className="flex items-center gap-1.5 bg-emerald-50 px-4 py-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12l4 4 10-10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[12px] font-bold text-emerald-700">
            반띵 장소가 변경됐어요
          </span>
        </header>

        <div className="px-4 pb-4 pt-3">
          <p className="text-[15px] font-bold text-gray-900">{meta.name}</p>
          {meta.address && (
            <p className="mt-0.5 text-[12px] text-gray-500">{meta.address}</p>
          )}

          <div className="mt-3">
            <KakaoMiniMap lat={meta.lat} lng={meta.lng} title={meta.name} />
          </div>
        </div>
      </article>
    </div>
  );
}

// ---- 이미지 메시지 ----
// chat_messages.metadata에 { kind: "image", public_url, width?, height? }로 저장됨.

interface ImageMeta {
  kind: "image";
  storage_path: string;
  public_url: string;
  width?: number | null;
  height?: number | null;
}

function isImageMessage(meta: Record<string, unknown> | null | undefined): boolean {
  return !!meta && (meta as { kind?: unknown }).kind === "image"
    && typeof (meta as { public_url?: unknown }).public_url === "string";
}

function ImageBubble({
  meta,
  mine,
  prevIsSameSender,
  nextIsSameSender,
}: {
  meta: ImageMeta;
  mine: boolean;
  prevIsSameSender: boolean;
  nextIsSameSender: boolean;
}) {
  // 종횡비 유지 — 메타가 없으면 4:3 fallback
  const aspect =
    meta.width && meta.height && meta.width > 0 && meta.height > 0
      ? meta.width / meta.height
      : 4 / 3;
  // 모바일 채팅에서 합리적인 최대 폭: 220~260px
  const maxWidth = 240;

  return (
    <a
      href={meta.public_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="이미지 크게 보기"
      className={cn(
        "overflow-hidden bg-gray-100",
        mine
          ? cn(
              "rounded-2xl",
              !prevIsSameSender && "rounded-tr-md",
              !nextIsSameSender && "rounded-br-md",
            )
          : cn(
              "rounded-2xl",
              !prevIsSameSender && "rounded-tl-md",
              !nextIsSameSender && "rounded-bl-md",
            ),
      )}
      style={{ width: maxWidth, aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.public_url}
        alt="첨부 이미지"
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </a>
  );
}

// ---- 띵동 카드 ----
// chat_messages.metadata에 { kind: "doorbell_ring", sender_id, sender_nickname, sender_role }로 저장됨.
function isDoorbellRing(meta: Record<string, unknown> | null | undefined): boolean {
  return !!meta && (meta as { kind?: unknown }).kind === "doorbell_ring";
}

function DoorbellCard({
  content,
  mine,
  onOpenCard,
}: {
  content: string;
  mine?: boolean;
  onOpenCard?: () => void;
}) {
  return (
    <div className={cn("my-3 flex w-full", mine ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "inline-flex max-w-sm items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-brand/[0.08] px-4 py-3 ring-1 ring-amber-200",
          mine && "flex-row-reverse",
        )}
      >
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm"
          aria-hidden
        >
          <span className="text-[18px]">🔔</span>
        </span>
        <div className={cn("min-w-0", mine && "text-right")}>
          <p className="text-[13px] font-semibold text-gray-900">{content}</p>
          {onOpenCard && (
            <button
              type="button"
              onClick={onOpenCard}
              className="mt-1 text-[12px] font-semibold text-brand underline-offset-2 hover:underline active:underline"
            >
              내 거래 카드보기 →
            </button>
          )}
        </div>
      </article>
    </div>
  );
}

