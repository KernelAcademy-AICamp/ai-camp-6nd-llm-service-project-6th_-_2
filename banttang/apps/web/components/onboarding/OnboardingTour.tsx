"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import {
  STEPS,
  type ChipOption,
  type ChoiceOption,
  type SampleCard,
  type Step,
} from "./steps";

type ResponseValue = { value: string | string[]; label: string };

// 봇 메시지 자동 진행 지연 (ms)
const AUTO_ADVANCE_MS = 500;
const AUTO_ADVANCE_RICH_MS = 700;

export function OnboardingTour() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, ResponseValue>>({});
  // rich_cards 단계별로 체크된 카드 수. 클릭마다 +1, 마지막 카드 체크 시 다음 단계로.
  const [cardChecks, setCardChecks] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  // 스크롤 영역 높이 — 마지막 메시지 아래에 (이 값 * 0.4)만큼 빈 공간 둠
  const [scrollerH, setScrollerH] = useState(0);

  // 스크롤 컨테이너 높이 추적 (ResizeObserver). 화면 회전·창 크기 변화에도 반영.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScrollerH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function handleCardCheck(stepId: string) {
    const step = STEPS.find((s) => s.id === stepId);
    if (!step || step.kind !== "rich_cards") return;
    const current = cardChecks[stepId] ?? 0;
    const next = current + 1;
    setCardChecks((prev) => ({ ...prev, [stepId]: next }));
    if (next >= step.cards.length) {
      // 모든 카드 체크 완료 → 사용자 응답 버블 + 다음 단계로 (체크 transition 보이게 약간 지연)
      setTimeout(() => {
        setResponses((prev) => ({
          ...prev,
          [stepId]: { value: "checked", label: step.finalUserLabel },
        }));
        setIdx((i) => i + 1);
      }, 350);
    }
  }

  const currentStep = STEPS[idx];
  const done = !currentStep;

  // 봇/매트릭스는 자동 진행. rich_cards는 카드 하나씩 사용자가 체크해야 진행.
  useEffect(() => {
    if (!currentStep) return;
    const isAuto =
      currentStep.kind === "bot" || currentStep.kind === "type_matrix";
    if (!isAuto) return;
    const delay = currentStep.kind === "bot" ? AUTO_ADVANCE_MS : AUTO_ADVANCE_RICH_MS;
    const t = setTimeout(() => setIdx((i) => i + 1), delay);
    return () => clearTimeout(t);
  }, [idx, currentStep]);

  // 새 메시지 추가될 때 스크롤 하단으로 (spacer 적용 후 자동으로 40% 여백 남음)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [idx, scrollerH]);

  function answer(stepId: string, value: string | string[], label: string) {
    setResponses((prev) => ({ ...prev, [stepId]: { value, label } }));
    setIdx((i) => i + 1);
  }

  function finish(nextHref: string) {
    // 추후: save-onboarding 서버 액션 호출. 지금은 라우팅만.
    router.push(nextHref as any);
  }

  // 렌더링할 히스토리: 0..idx-1까지 + 현재 (현재 봇/카드면 보이고, 입력 단계면 input 패널만)
  const visibleSteps = STEPS.slice(0, idx + 1);

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col bg-gradient-to-b from-brand/[0.06] via-white to-brand/[0.04]">
      <header className="flex items-center justify-center border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur">
        <span className="text-[15px] font-bold text-gray-900">시작하기</span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {(() => {
            // 연속된 봇 메시지에서 가장 첫 메시지만 아바타 노출.
            // 유저 응답(input 답변, 모든 카드 체크 완료)이 나오면 다음 봇 메시지에서 아바타 다시 표시.
            let firstBotInTurn = true;
            return visibleSteps.map((step, i) => {
              const isCurrent = i === visibleSteps.length - 1;
              let showAvatar = false;
              if (step.kind === "bot") {
                showAvatar = firstBotInTurn;
                firstBotInTurn = false;
              } else if (step.kind === "type_matrix") {
                // 단순 정보 표시 — 봇 차례 계속
              } else if (step.kind === "rich_cards") {
                // 모든 카드 체크 완료(응답 저장됨) = 유저 액션 발생 → 다음 봇은 새 차례
                if (responses[step.id]) firstBotInTurn = true;
              } else if (responses[step.id]) {
                // 유저가 응답한 입력 단계 → 다음 봇은 새 차례
                firstBotInTurn = true;
              }
              return (
                <HistoryItem
                  key={step.id}
                  step={step}
                  responses={responses}
                  isCurrent={isCurrent}
                  cardChecks={cardChecks[step.id] ?? 0}
                  onCardCheck={() => handleCardCheck(step.id)}
                  showAvatar={showAvatar}
                />
              );
            });
          })()}
          {/* 마지막 메시지 아래 40% 여백 — 자동 스크롤 시 새 메시지가 화면 위쪽에 노출되어 답변 버튼이 안 가려짐 */}
          {scrollerH > 0 && (
            <div style={{ height: scrollerH * 0.4 }} className="shrink-0" aria-hidden />
          )}
        </div>
      </div>

      {/* 입력 패널 — bot/matrix/rich_cards 외 단계에서만 표시 (rich_cards는 카드 자체에 체크 버튼) */}
      {currentStep &&
        currentStep.kind !== "bot" &&
        currentStep.kind !== "rich_cards" &&
        currentStep.kind !== "type_matrix" && (
        <InputPanel
          step={currentStep}
          onAnswer={(value, label) => answer(currentStep.id, value, label)}
          onFinish={finish}
        />
      )}

      {done && (
        <div className="border-t border-zinc-200 bg-white p-4 text-center text-[13px] text-gray-500">
          완료!
        </div>
      )}
    </div>
  );
}

// ──────────────── 히스토리 렌더링 ────────────────

function HistoryItem({
  step,
  responses,
  isCurrent,
  cardChecks,
  onCardCheck,
  showAvatar,
}: {
  step: Step;
  responses: Record<string, ResponseValue>;
  isCurrent: boolean;
  cardChecks: number;
  onCardCheck: () => void;
  showAvatar: boolean;
}) {
  if (step.kind === "bot") return <BotBubble showAvatar={showAvatar}>{step.text}</BotBubble>;
  if (step.kind === "rich_cards") {
    // 활성 단계: 체크된 카드 + 현재 미체크 카드 1장 (다음 카드는 체크 후 공개)
    // 지나간 단계: 모든 카드 노출 + 전부 체크 상태 + 사용자 응답 버블
    const total = step.cards.length;
    const checked = isCurrent ? cardChecks : total;
    const visibleCount = isCurrent ? Math.min(checked + 1, total) : total;
    const allChecked = checked >= total;
    return (
      <>
        <SampleCardStack
          cards={step.cards.slice(0, visibleCount)}
          checkedCount={checked}
          onCheckCurrent={isCurrent && !allChecked ? onCardCheck : undefined}
        />
        {allChecked && <UserBubble>{step.finalUserLabel}</UserBubble>}
      </>
    );
  }
  if (step.kind === "type_matrix") return <TypeMatrix />;

  // 입력 단계의 히스토리 표현: 응답이 있으면 UserBubble, 없으면 (현재 단계 진행 중) 아무것도 안 그림
  const response = responses[step.id];
  if (!response) return null;
  return <UserBubble>{response.label}</UserBubble>;
}

function TypeMatrix() {
  const rows = [
    { emoji: "🛵", name: "배달음식" },
    { emoji: "🛒", name: "장보기" },
  ];
  return (
    <div className="ml-9 mt-1 overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.05]">
      {rows.map((r, i) => (
        <div
          key={r.name}
          className={cn(
            "flex items-center justify-between gap-2 px-4 py-3",
            i > 0 && "border-t border-zinc-100",
          )}
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
            <span>{r.emoji}</span>
            <span>{r.name}</span>
          </span>
          <span className="flex gap-1.5">
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
              나눠요
            </span>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
              담아요
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ──────────────── 말풍선들 ────────────────

function BotBubble({
  children,
  showAvatar = true,
}: {
  children: ReactNode;
  showAvatar?: boolean;
}) {
  return (
    <div className="flex items-end gap-2">
      {showAvatar ? <BotAvatar /> : <div className="h-8 w-8 shrink-0" aria-hidden />}
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-snug text-gray-900 ring-1 ring-black/[0.04]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[14px] font-medium text-white">
        {children}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-black/[0.05]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/abot.svg"
        alt="아봇"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function SampleCardStack({
  cards,
  checkedCount,
  onCheckCurrent,
}: {
  cards: SampleCard[];
  checkedCount: number;
  onCheckCurrent?: () => void;
}) {
  return (
    <div className="ml-9 flex flex-col gap-2">
      {cards.map((c, i) => {
        const isChecked = i < checkedCount;
        // 현재 미체크 카드(=다음 클릭 대상)는 마지막 보이는 카드
        const isCurrentClickable = !isChecked && i === checkedCount && !!onCheckCurrent;
        return (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-black/[0.05]"
          >
            <span className="shrink-0 text-[22px]">{c.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-medium text-gray-900">
                {c.title}
              </p>
              {c.subtitle && (
                <p className="mt-0.5 truncate text-[11px] text-gray-500">{c.subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={isCurrentClickable ? onCheckCurrent : undefined}
              disabled={!isCurrentClickable}
              aria-label={isChecked ? "확인 완료" : "확인하기"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ring-1 transition-colors",
                isChecked
                  ? "bg-brand text-white ring-brand"
                  : isCurrentClickable
                    ? "bg-zinc-50 text-zinc-300 ring-zinc-300 hover:bg-brand/10 hover:text-brand active:bg-brand/15"
                    : "bg-zinc-50 text-zinc-200 ring-zinc-200",
              )}
            >
              ✓
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────── 입력 패널 ────────────────

function InputPanel({
  step,
  onAnswer,
  onFinish,
}: {
  step: Step;
  onAnswer: (value: string | string[], label: string) => void;
  onFinish: (nextHref: string) => void;
}) {
  if (step.kind === "choice") {
    return <ChoicePanel options={step.options} onPick={onAnswer} />;
  }
  if (step.kind === "chips") {
    return (
      <ChipsPanel
        options={step.options}
        allowOther={!!step.allowOther}
        onSubmit={onAnswer}
        onSkip={() => onAnswer([], "없어요")}
      />
    );
  }
  if (step.kind === "address") {
    return <AddressPanel onSubmit={(addr) => onAnswer(addr, addr)} />;
  }
  if (step.kind === "finish") {
    return (
      <div className="border-t border-zinc-200 bg-white p-4">
        <div className="flex gap-2">
          {step.secondaryCta && step.secondaryHref && (
            <button
              type="button"
              onClick={() => onFinish(step.secondaryHref!)}
              className="h-12 flex-1 rounded-xl bg-zinc-100 text-[13px] font-semibold text-gray-700 transition-colors active:bg-zinc-200"
            >
              {step.secondaryCta}
            </button>
          )}
          <button
            type="button"
            onClick={() => onFinish(step.nextHref)}
            className="h-12 flex-1 rounded-xl bg-brand text-[14px] font-bold text-white transition-opacity active:opacity-80"
          >
            {step.cta}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

function ChoicePanel({
  options,
  onPick,
}: {
  options: ChoiceOption[];
  onPick: (value: string, label: string) => void;
}) {
  const layout =
    options.length === 1
      ? "grid-cols-1"
      : options.length === 2
        ? "grid-cols-2"
        : "grid-cols-1";
  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <div className={cn("grid gap-2", layout)}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value, o.label)}
            className="h-12 w-full rounded-xl bg-brand px-3 text-[14px] font-bold text-white transition-opacity active:opacity-80"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipsPanel({
  options,
  allowOther,
  onSubmit,
  onSkip,
}: {
  options: ChipOption[];
  allowOther: boolean;
  onSubmit: (values: string[], label: string) => void;
  onSkip: () => void;
}) {
  // 상위 체크 → 하위 활성화. 상위 체크 해제 시 그 카테고리의 하위 선택도 모두 해제.
  const [topSelected, setTopSelected] = useState<Set<string>>(new Set());
  const [subSelected, setSubSelected] = useState<Set<string>>(new Set());
  const [otherOn, setOtherOn] = useState(false);
  const [otherText, setOtherText] = useState("");

  function toggleTop(catValue: string) {
    const willCheck = !topSelected.has(catValue);
    setTopSelected((prev) => {
      const next = new Set(prev);
      if (willCheck) next.add(catValue);
      else next.delete(catValue);
      return next;
    });
    // 체크 해제 시 해당 카테고리의 하위 선택도 같이 해제
    if (!willCheck) {
      const cat = options.find((o) => o.value === catValue);
      if (cat?.subOptions) {
        setSubSelected((prevSub) => {
          const ns = new Set(prevSub);
          for (const s of cat.subOptions!) ns.delete(s.value);
          return ns;
        });
      }
    }
  }

  function toggleSub(subValue: string, catValue: string) {
    if (!topSelected.has(catValue)) return; // 상위 미체크 시 무시
    setSubSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subValue)) next.delete(subValue);
      else next.add(subValue);
      return next;
    });
  }

  const canSubmit =
    topSelected.size > 0 ||
    (allowOther && otherOn && otherText.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    const values: string[] = [];
    const labels: string[] = [];
    // 체크된 상위만 순회, 그 안의 선택된 하위들 수집
    for (const cat of options) {
      if (!topSelected.has(cat.value)) continue;
      values.push(cat.value);
      const subs = cat.subOptions ?? [];
      const chosen = subs.filter((s) => subSelected.has(s.value));
      if (chosen.length > 0) {
        for (const s of chosen) {
          values.push(s.value);
          labels.push(s.label);
        }
      } else {
        // 상위만 체크되고 하위 미선택 → 상위 라벨로 표시
        labels.push(cat.label);
      }
    }
    if (allowOther && otherOn && otherText.trim()) {
      values.push(`other:${otherText.trim()}`);
      labels.push(`기타: ${otherText.trim()}`);
    }
    onSubmit(values, labels.length > 0 ? labels.join(", ") : "없어요");
  }

  return (
    <div className="flex max-h-[65dvh] flex-col rounded-t-2xl border-t border-zinc-200 bg-white shadow-lg">
      {/* 스크롤 영역 — 카테고리 헤더(체크 가능) + 하위 칩들 */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 pt-4">
        <div className="space-y-4">
          {options.map((category) => {
            const subs = category.subOptions ?? [];
            const topOn = topSelected.has(category.value);
            return (
              <div key={category.value}>
                <button
                  type="button"
                  onClick={() => toggleTop(category.value)}
                  className={cn(
                    "mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold ring-1 transition-colors",
                    topOn
                      ? "bg-brand text-white ring-brand"
                      : "bg-zinc-50 text-gray-800 ring-zinc-200 active:bg-zinc-100",
                  )}
                  aria-pressed={topOn}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                      topOn ? "bg-white text-brand" : "bg-white text-zinc-300 ring-1 ring-zinc-300",
                    )}
                    aria-hidden
                  >
                    {topOn ? "✓" : ""}
                  </span>
                  <span>{category.emoji}</span>
                  <span>{category.label}</span>
                </button>
                {subs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map((s) => {
                      const on = subSelected.has(s.value);
                      const disabled = !topOn;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => toggleSub(s.value, category.value)}
                          disabled={disabled}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-colors",
                            disabled
                              ? "cursor-not-allowed bg-zinc-50 text-zinc-300 ring-zinc-200"
                              : on
                                ? "bg-brand/10 text-brand ring-brand"
                                : "bg-zinc-50 text-gray-700 ring-zinc-200 active:bg-zinc-100",
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {allowOther && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-gray-900">
                <span>✏️</span>
                <span>기타</span>
              </p>
              <button
                type="button"
                onClick={() => setOtherOn((v) => !v)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium ring-1",
                  otherOn
                    ? "bg-brand/10 text-brand ring-brand"
                    : "bg-zinc-50 text-gray-700 ring-zinc-200",
                )}
              >
                {otherOn ? "닫기" : "직접 입력하기"}
              </button>
              {otherOn && (
                <input
                  autoFocus
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="직접 입력해주세요"
                  className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[14px] outline-none focus:border-brand"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 액션 버튼 — 항상 패널 하단 고정 */}
      <div className="flex gap-2 border-t border-zinc-100 bg-white p-4">
        <button
          type="button"
          onClick={onSkip}
          className="h-12 flex-1 rounded-xl bg-zinc-100 text-[13px] font-semibold text-gray-700 transition-colors active:bg-zinc-200"
        >
          없어요
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="h-12 flex-1 rounded-xl bg-brand text-[14px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-50"
        >
          선택 완료
        </button>
      </div>
    </div>
  );
}

function AddressPanel({
  onSubmit,
}: {
  onSubmit: (address: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "map">("choose");
  const [geoLoading, setGeoLoading] = useState(false);
  const [mapSubmitting, setMapSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 좌표 → 서버 저장(역지오코딩 + 동네 find-or-create + profiles.neighborhood_id 연결)
  // → 서버가 돌려준 "구 동" 주소로 챗봇 답변을 채운다.
  async function saveAndAdvance(lat: number, lng: number) {
    let address = "현재 위치";
    try {
      const res = await fetch("/api/onboarding/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "current_location", lat, lng }),
      });
      const json = (await res.json()) as { address?: string };
      if (json.address) address = json.address;
      // 저장된 쿠키/동네를 (app) 공유 레이아웃(UserBar 주소 등)이 다시 읽도록 갱신.
      // 레이아웃은 화면 이동만으론 재렌더되지 않아 명시적 refresh가 필요.
      router.refresh();
    } catch {
      // 저장 실패해도 온보딩 흐름은 계속 진행
    }
    onSubmit(address);
  }

  // "현재 위치로 설정" — 실제 GPS를 가져와 저장.
  function useCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("이 브라우저는 위치를 지원하지 않아요. 지도에서 선택해주세요.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await saveAndAdvance(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 지도에서 선택하거나 권한을 허용해주세요."
            : "위치를 가져오지 못했어요. 지도에서 선택해주세요.",
        );
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  if (mode === "map") {
    return (
      <LocationMapPicker
        submitting={mapSubmitting}
        onCancel={() => setMode("choose")}
        onConfirm={async (lat, lng) => {
          setMapSubmitting(true);
          await saveAndAdvance(lat, lng);
          setMapSubmitting(false);
        }}
      />
    );
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={geoLoading}
          className="h-12 w-full rounded-xl bg-brand text-[14px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-50"
        >
          {geoLoading ? "내 위치 확인 중…" : "📍 현재 위치로 설정"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode("map");
          }}
          className="h-12 w-full rounded-xl bg-zinc-100 text-[14px] font-semibold text-gray-700 transition-colors active:bg-zinc-200"
        >
          🗺️ 지도에서 선택
        </button>
        {error && (
          <p className="px-1 text-[12px] text-rose-500">{error}</p>
        )}
      </div>
    </div>
  );
}

// 지도에서 위치를 찍는 피커 — 지도를 움직여 중앙 핀을 내 위치에 맞추고 "이 위치로 설정".
// 핀은 화면 중앙에 고정되고 지도가 움직이는 방식(중앙 좌표 = 선택 좌표).
function LocationMapPicker({
  onConfirm,
  onCancel,
  submitting,
}: {
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";

  useEffect(() => {
    if (!ready || !mapEl.current || mapRef.current) return;
    const kakao = window.kakao;
    const map = new kakao.maps.Map(mapEl.current, {
      center: new kakao.maps.LatLng(37.4842, 126.9296), // 신림역 기본 중심
      level: 4,
    });
    mapRef.current = map;
    setTimeout(() => map.relayout(), 0);
    // 현재 위치가 잡히면 그쪽으로 초기 이동 (권한 거부 시 기본 중심 유지)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          map.setCenter(
            new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude),
          ),
        () => {},
        { timeout: 6000 },
      );
    }
  }, [ready]);

  function confirm() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    onConfirm(c.getLat(), c.getLng());
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <p className="mb-2 px-1 text-[12px] text-gray-500">
        지도를 움직여 핀을 내 위치에 맞춰주세요
      </p>
      <div className="relative h-[55dvh] min-h-[320px] w-full overflow-hidden rounded-xl bg-gray-100">
        <div ref={mapEl} className="isolate h-full w-full" />
        {/* 중앙 고정 핀 (지도가 움직이고 핀은 가운데 고정 — 핀 끝이 중앙을 가리킴).
            카카오맵 내부 요소 위에 보이도록 z-index 부여. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full text-[34px] leading-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
          📍
        </div>
        {/* 정확한 중심점 표시용 작은 점 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-white" />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-gray-400">
            {sdk.status === "error" || sdk.status === "no_key"
              ? "지도를 불러올 수 없어요"
              : "지도 불러오는 중…"}
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-xl bg-zinc-100 text-[13px] font-semibold text-gray-700"
        >
          뒤로
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || submitting}
          className="h-12 flex-1 rounded-xl bg-brand text-[14px] font-bold text-white disabled:opacity-50"
        >
          {submitting ? "저장 중…" : "이 위치로 설정"}
        </button>
      </div>
    </div>
  );
}
