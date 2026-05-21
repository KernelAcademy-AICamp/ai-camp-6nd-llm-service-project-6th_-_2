"use client";

import type { RefObject } from "react";
import type { ChatItem } from "@/lib/types/chat";
import { cn, formatKstTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ReceiptCardMessage } from "./receipt-card-message";

interface Props {
  items: ChatItem[];
  currentUserId: string;
  participantCount: number;
  scrollAnchorRef: RefObject<HTMLDivElement>;
}

// 메시지 + 영수증 카드를 시간순으로 함께 렌더.
export function ChatTimeline({
  items,
  currentUserId,
  participantCount,
  scrollAnchorRef,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-foreground/[0.02] px-4 py-3">
      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-foreground/40">
          첫 메시지를 남겨보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => {
            if (item.kind === "receipt") {
              return (
                <li key={`r-${item.data.id}`}>
                  <ReceiptCardMessage
                    receipt={item.data}
                    participantCount={participantCount}
                  />
                </li>
              );
            }

            const m = item.data;
            const mine = m.sender_id === currentUserId;
            const prev = items[i - 1];
            const prevSameSender =
              prev && prev.kind === "message" && prev.data.sender_id === m.sender_id;
            const showHeader = !prevSameSender && !mine;

            return (
              <li
                key={`m-${m.id}`}
                className={cn(
                  "flex flex-col",
                  mine ? "items-end" : "items-start",
                  showHeader ? "mt-2" : "",
                )}
              >
                {showHeader && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <Avatar nickname={m.sender?.nickname ?? "?"} size={20} />
                    <span className="text-xs text-foreground/70">
                      {m.sender?.nickname ?? "알 수 없음"}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex items-end gap-1",
                    mine ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <span
                    className={cn(
                      "max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm",
                      mine
                        ? "bg-brand text-brand-foreground"
                        : "bg-background text-foreground",
                    )}
                  >
                    {m.content}
                  </span>
                  <time className="text-[10px] text-foreground/40">
                    {formatKstTime(m.created_at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div ref={scrollAnchorRef} />
    </div>
  );
}
