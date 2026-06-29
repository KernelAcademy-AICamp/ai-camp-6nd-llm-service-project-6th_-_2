"use client";

import { Fragment, useState, type RefObject } from "react";
import type { ChatItem } from "@/lib/types/chat";
import { cn, formatKstDateLabel, formatKstTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ReceiptCardMessage } from "./receipt-card-message";
import { KakaoMiniMap } from "./kakao-mini-map";
import { AvocadoBotCard } from "./avocado-bot-card";
import { LinkPreview } from "./link-preview";

// 메시지 텍스트 내 URL 탐지/링크화.
// http(s):// 스킴이 있는 URL + www. 시작 + 흔한 TLD 도메인(스킴 없이 입력해도 인식).
const URL_CORE =
  "(?:https?:\\/\\/|www\\.)[^\\s<]+|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|io|co|kr|gg|me|tv|app|shop|store|news|dev|ai|xyz)(?:\\/[^\\s<]*)?";
const URL_RE = new RegExp(`(${URL_CORE})`, "gi");
const SINGLE_URL = new RegExp(`^(?:${URL_CORE})$`, "i");

// 뒤따라온 문장부호 제거 + 스킴 없는 주소에 https:// 보정
function normalizeUrl(u: string): string {
  const cleaned = u.replace(/[.,!?)\]}'"]+$/, "");
  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  return m?.[0] ? normalizeUrl(m[0]) : null;
}

// 긴 URL은 그대로 두면 버블이 지저분해짐 → 도메인+경로 위주로 축약 표시(href는 원본 유지)
function prettyUrl(u: string): string {
  try {
    const x = new URL(normalizeUrl(u));
    const path = x.pathname === "/" ? "" : x.pathname;
    const base = x.hostname.replace(/^www\./, "") + path + x.search;
    return base.length > 42 ? base.slice(0, 42) + "…" : base;
  } catch {
    return u.length > 38 ? u.slice(0, 38) + "…" : u;
  }
}

function linkify(text: string, mine?: boolean) {
  return text.split(URL_RE).map((part, i) =>
    SINGLE_URL.test(part) ? (
      <a
        key={i}
        href={normalizeUrl(part)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "break-all underline underline-offset-2",
          mine ? "text-white" : "text-brand-dark",
        )}
      >
        {prettyUrl(part)}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

interface Props {
  items: ChatItem[];
  currentUserId: string;
  isHost: boolean;
  participantCount: number;
  // 현재 채팅방 모든 멤버 user_id (안읽은 수 계산용)
  memberUserIds: string[];
  // user_id → 닉네임 (1:1 띵동 문구에 상대 닉네임 표시용)
  memberNames?: Record<string, string>;
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
  // 아보카도 봇 "거래 방법 보기" — 거래 방법 안내 페이지로 이동.
  onShowGuide?: () => void;
  // 아보카도 봇 "띵동이란?" — 띵동 안내 페이지로 이동.
  onShowDoorbell?: () => void;
  // 영수증 인증 요청 카드의 '영수증 등록'(호스트) 버튼.
  onUploadReceipt?: () => void;
  // 채팅에서 상대 아바타/이름 탭 → 공개 프로필 시트 열기.
  onTapMember?: (userId: string, nickname: string) => void;
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
  memberNames,
  reads,
  scrollAnchorRef,
  onChangePickup,
  onDismissMidpoint,
  onOpenTransactionCard,
  onShowGuide,
  onShowDoorbell,
  onUploadReceipt,
  onTapMember,
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
                    // 1:1(호스트+1명)에선 "모두에게"가 어색 → 상대 닉네임
                    if (participantCount <= 2) {
                      const otherId = memberUserIds.find((id) => id !== currentUserId);
                      const otherNick = (otherId && memberNames?.[otherId]) || "상대";
                      displayText = `${otherNick}님에게 "띵동" 했어요`;
                    } else {
                      displayText = `모두에게 "띵동" 했어요`;
                    }
                  } else {
                    const hostNick = meta.host_nickname ?? "파티장";
                    displayText = `${hostNick}님에게 "띵동" 했어요`;
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

              // 아보카도 봇 메시지 — 왼쪽 봇 말풍선/카드 (회색 시스템 메시지 아님).
              const metaKind = (m.metadata as { kind?: string } | null)?.kind;
              // 입장 안내 카드 — "거래 방법 보기" 버튼 포함
              if (metaKind === "avocado_intro" || metaKind === "avocado_notice") {
                // legacy 행은 "🥑 방장봇 아보카도: " 접두어가 붙어 있어 제거.
                const text = (m.content ?? "").replace(
                  /^🥑\s*방장봇 아보카도:\s*/,
                  "",
                );
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li>
                      <AvocadoBotCard content={text} onShowGuide={onShowGuide} />
                    </li>
                  </Fragment>
                );
              }
              // 거래 1시간 전 띵동 안내 — 봇 카드 + '띵동이란?' 버튼
              if (metaKind === "avocado_doorbell") {
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li>
                      <AvocadoBotCard
                        content={m.content ?? ""}
                        onShowDoorbell={onShowDoorbell}
                      />
                    </li>
                  </Fragment>
                );
              }
              // 영수증 인증 요청 — 요청자(나)는 오른쪽 정렬, 프로필 없음 + (호스트) 영수증 등록 버튼
              if (metaKind === "receipt_request") {
                const meta = m.metadata as { sender_id?: string } | null;
                const mineReq = meta?.sender_id === currentUserId;
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li
                      className={cn(
                        "my-2 flex",
                        mineReq ? "justify-end px-1" : "justify-start pl-11 pr-3",
                      )}
                    >
                      <div
                        className={cn(
                          "border border-amber-200 bg-amber-50 p-3.5",
                          mineReq ? "max-w-[82%] rounded-2xl rounded-tr-md" : "w-full rounded-2xl rounded-tl-md",
                        )}
                      >
                        <p className="text-[13px] leading-relaxed text-amber-900">
                          {m.content}
                        </p>
                        {isHost && onUploadReceipt && (
                          <button
                            type="button"
                            onClick={onUploadReceipt}
                            className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-[13px] font-bold text-white active:opacity-80"
                          >
                            영수증 등록
                          </button>
                        )}
                      </div>
                    </li>
                  </Fragment>
                );
              }

              // 거래 방법 안내 — 버튼 없는 봇 말풍선
              if (metaKind === "avocado_guide") {
                return (
                  <Fragment key={`m-${m.id}`}>
                    {dateNode}
                    <li>
                      <AvocadoBotCard content={m.content ?? ""} />
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

              // 시스템 메시지는 DB content를 그대로 노출.
              // (이벤트 분리 전 legacy 'party_closed'는 거래방 오픈/퇴장이 섞여 있었으나,
              //  거래방 오픈 행만 옛 문구라 신규 카피로 보정. 퇴장 행은 content에 닉네임이
              //  들어가므로 그대로 노출. 신규는 chat_opened/member_left로 구분됨)
              const displayContent =
                m.system_event === "party_closed" &&
                m.content === "모집 완료! 거래방이 열렸어요"
                  ? "모집이 완료되어 거래방이 열렸어요. 이제 주문과 나눔 일정을 확인해 주세요."
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
                  <div
                    className={cn(
                      "flex max-w-[85%] gap-2",
                      mine ? "flex-row-reverse items-end" : "flex-row items-start",
                    )}
                  >
                    {/* 상대 메시지 아바타: 그룹 첫 메시지에만, 위쪽 정렬. 나머지는 자리 비움 */}
                    {!mine && (
                      <span className="w-8 shrink-0">
                        {!prevIsSameSender && (
                          <button
                            type="button"
                            onClick={
                              m.sender_id && onTapMember
                                ? () => onTapMember(m.sender_id!, m.sender?.nickname ?? "회원")
                                : undefined
                            }
                            aria-label={`${m.sender?.nickname ?? "회원"} 프로필 보기`}
                            className="rounded-full transition active:opacity-70"
                          >
                            <Avatar nickname={m.sender?.nickname ?? "?"} size={32} />
                          </button>
                        )}
                      </span>
                    )}

                    {/* 이름(상대) + 말풍선 묶음 — 카카오톡 구조 */}
                    <div
                      className={cn(
                        "flex min-w-0 flex-col gap-1",
                        mine ? "items-end" : "items-start",
                      )}
                    >
                      {showHeader && (
                        <button
                          type="button"
                          onClick={
                            m.sender_id && onTapMember
                              ? () => onTapMember(m.sender_id!, m.sender?.nickname ?? "회원")
                              : undefined
                          }
                          className="px-1 text-[12px] font-medium text-gray-700 active:opacity-70"
                        >
                          {m.sender?.nickname ?? "알 수 없음"}
                        </button>
                      )}
                      <div
                        className={cn(
                          "flex flex-col gap-1",
                          mine ? "items-end" : "items-start",
                        )}
                      >
                        {/* 메인 말풍선 + 시간 — 한 줄로 묶어 시간이 말풍선 옆에 붙도록 */}
                        <div
                          className={cn(
                            "flex items-end gap-1.5",
                            mine ? "flex-row-reverse" : "flex-row",
                          )}
                        >
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
                                // 꼬리(노치)는 항상 바깥-위 모서리에. 아래 노치 없음.
                                mine
                                  ? "rounded-2xl rounded-tr-md"
                                  : "rounded-2xl rounded-tl-md",
                              )}
                            >
                              {linkify(m.content ?? "", mine)}
                            </div>
                          )}

                          <div className="mb-0.5 flex shrink-0 items-end gap-1 text-[10px] leading-none">
                            {(() => {
                              const unread = unreadCountFor(m);
                              return unread > 0 ? (
                                <span className="font-bold text-amber-500 tabular-nums">
                                  {unread}
                                </span>
                              ) : null;
                            })()}
                            {showTime && (
                              <time className="text-gray-400">
                                {formatKstTime(m.created_at)}
                              </time>
                            )}
                          </div>
                        </div>

                        {/* 링크 미리보기 — 말풍선 아래 별도 줄(폭 넓어도 시간 정렬에 영향 X) */}
                        {!isImageMessage(m.metadata) && firstUrl(m.content) && (
                          <LinkPreview url={firstUrl(m.content)!} mine={mine} />
                        )}
                      </div>
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
    <div className="my-2 flex justify-start pl-11 pr-3">
      <article className="w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
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
            파티장에게만 보여요
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
    <div className={cn("my-2 flex px-1", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] border border-amber-200 bg-amber-50 p-3.5",
          mine ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-tl-md",
        )}
      >
        <div className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-amber-500">
            <path
              d="M12 3a5 5 0 0 0-5 5v3.5L5.5 15h13L17 11.5V8a5 5 0 0 0-5-5Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] font-semibold leading-relaxed text-amber-900">
            {content}
          </p>
        </div>
        {onOpenCard && (
          <button
            type="button"
            onClick={onOpenCard}
            className="mt-3 w-full rounded-lg bg-amber-600 py-2 text-[13px] font-bold text-white active:opacity-80"
          >
            내 거래 카드보기
          </button>
        )}
      </div>
    </div>
  );
}

