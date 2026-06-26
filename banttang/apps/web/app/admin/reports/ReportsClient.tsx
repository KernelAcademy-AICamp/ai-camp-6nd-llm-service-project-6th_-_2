"use client";

// 신고/분쟁 처리 — 상태 필터 + 신고자→피신고자 큐 + 당사자 카드 + 처리 액션.
//   상태: pending(대기) → reviewing(처리중) → resolved(완료) | dismissed(기각)
//   액션: 검토 시작 / 기각 / 경고 / 계정 제재 / 완료 처리
//     · 경고 = 피신고자 warning_count++ 후 완료
//     · 계정 제재 = 피신고자 정지 후 완료

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { formatKstShort, levelLabel } from "@/lib/party-status";
import { adminResolveReport, fetchReportChatLog } from "@/app/_actions/admin-reports";
import type { ReportCase, ReportStatus, ReportPartyCard, AdminMessage } from "@/lib/admin-queries";

type Filter = ReportStatus | "all";

const STATUS_META: Record<ReportStatus, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-amber-100 text-amber-700" },
  reviewing: { label: "처리중", cls: "bg-blue-100 text-blue-700" },
  resolved: { label: "완료", cls: "bg-emerald-100 text-emerald-700" },
  dismissed: { label: "기각", cls: "bg-zinc-200 text-zinc-600" },
};

const REASON_LABEL: Record<string, string> = {
  no_show: "노쇼", late: "지각/지연", payment: "정산 분쟁", unfair: "금액/수량 불만",
  abusive: "무례/시비", scam: "사기 의심", spam: "도배/스팸", other: "기타",
};

const TARGET_LABEL: Record<string, string> = {
  party: "거래", user: "회원", message: "메시지", review: "후기",
};

const LEVEL_EMOJI: Record<string, string> = { dandelion: "🌼", tree: "🌳", king: "👑" };

const reasonText = (c: string) => REASON_LABEL[c] ?? c;

export function ReportsClient({ cases }: { cases: ReportCase[] }) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: cases.length, pending: 0, reviewing: 0, resolved: 0, dismissed: 0 };
    for (const r of cases) c[r.status]++;
    return c;
  }, [cases]);

  const rows = useMemo(
    () => (filter === "all" ? cases : cases.filter((r) => r.status === filter)),
    [cases, filter],
  );

  // 필터가 바뀌면 첫 항목을 자동 선택(목록이 비면 해제)
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
    } else if (!rows.some((r) => r.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  const selected = cases.find((r) => r.id === selectedId) ?? null;

  const CHIPS: { key: Filter; label: string }[] = [
    { key: "pending", label: `대기 ${counts.pending}` },
    { key: "reviewing", label: `처리중 ${counts.reviewing}` },
    { key: "resolved", label: `완료 ${counts.resolved}` },
    { key: "dismissed", label: `기각 ${counts.dismissed}` },
    { key: "all", label: `전체 ${counts.all}` },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 상태 필터 */}
      <nav className="flex flex-wrap gap-1.5 px-1 text-[13px] font-semibold">
        {CHIPS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              filter === t.key
                ? "bg-brand text-white shadow-sm shadow-brand/30"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-dark",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="px-1 py-12 text-center text-sm text-zinc-500">해당하는 신고가 없어요.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* 신고 큐 — 신고자 → 피신고자 */}
          <ul className="flex flex-col gap-2 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
            {rows.map((r) => (
              <QueueRow
                key={r.id}
                report={r}
                active={r.id === selectedId}
                onSelect={() => setSelectedId(r.id)}
              />
            ))}
          </ul>

          {/* 상세 처리 */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            {selected ? (
              <DetailPanel
                key={selected.id}
                report={selected}
                onActed={(action) => {
                  // 검토 시작 → 같은 신고를 따라 처리중 탭으로 이동(선택 유지)
                  if (action === "review" && selected.status === "pending") setFilter("reviewing");
                }}
              />
            ) : (
              <p className="rounded-2xl border border-zinc-200/70 bg-white p-8 text-center text-sm text-zinc-400 shadow-sm shadow-black/[0.02]">
                신고를 선택하세요.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  report: r,
  active,
  onSelect,
}: {
  report: ReportCase;
  active: boolean;
  onSelect: () => void;
}) {
  const sm = STATUS_META[r.status];
  return (
    <li>
      <button
        onClick={onSelect}
        className={cn(
          "w-full rounded-2xl border p-3 text-left transition-colors",
          active
            ? "border-brand bg-white ring-1 ring-brand"
            : "border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] hover:border-brand/40 hover:bg-brand-50/40",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark">
            {reasonText(r.reason_code)}
          </span>
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500">
            {TARGET_LABEL[r.target_type] ?? r.target_type}
          </span>
          <span className="ml-auto" />
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold", sm.cls)}>
            {r.status === "reviewing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
            {sm.label}
          </span>
        </div>
        <p className="mt-1.5 truncate text-[14px] font-bold text-zinc-900">
          {r.reporter?.nickname ?? "?"}
          <span className="mx-1 font-normal text-zinc-400">→</span>
          {r.reportee?.nickname ?? "?"}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">
          {r.target_label} · {formatKstShort(r.created_at)}
        </p>
      </button>
    </li>
  );
}

function DetailPanel({
  report: r,
  onActed,
}: {
  report: ReportCase;
  onActed?: (action: "review" | "dismiss" | "resolve" | "warn" | "suspend") => void;
}) {
  const [note, setNote] = useState(r.resolved_note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sm = STATUS_META[r.status];
  const closed = r.status === "resolved" || r.status === "dismissed";
  const reviewing = r.status === "reviewing";

  // 케이스가 바뀌면 메모/에러 초기화
  useEffect(() => {
    setNote(r.resolved_note ?? "");
    setErr(null);
  }, [r.id, r.resolved_note]);

  const act = (action: "review" | "dismiss" | "resolve" | "warn" | "suspend") => {
    setErr(null);
    startTransition(async () => {
      const res = await adminResolveReport(r.id, action, { note, reporteeId: r.reportee_id });
      if (!res.ok) setErr(res.error);
      else onActed?.(action);
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm shadow-black/[0.02]">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-600">
          {reasonText(r.reason_code)}
        </span>
        <span className="text-[12px] text-zinc-400">
          {r.target_label} · {formatKstShort(r.created_at)}
        </span>
        <span className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold", sm.cls)}>
          {reviewing && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {sm.label}
        </span>
      </div>

      {/* 작업중 배너 — 검토 시작 후 처리중 상태 */}
      {reviewing && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[12.5px] font-semibold text-blue-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          작업중 — 검토하고 있어요. 처리(기각·경고·제재·완료)를 진행하세요.
        </div>
      )}

      {/* 신고 내용 */}
      {r.reason_detail && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-relaxed text-zinc-700">
          {r.reason_detail}
        </p>
      )}

      {/* 당사자 카드 */}
      <div className="mt-3 flex flex-col gap-2.5">
        <PartyCard role="신고자" card={r.reporter} />
        <PartyCard role="피신고자" card={r.reportee} />
      </div>

      {/* 근거 — 채팅 로그 인라인 펼침 + 전체 거래 페이지 링크 (항상 표시) */}
      <ChatLog
        partyId={r.target_party_id}
        reporterId={r.reporter?.id ?? null}
        reporteeId={r.reportee_id}
      />

      {/* 운영 메모 */}
      <p className="mb-1.5 mt-4 text-[12px] font-semibold text-zinc-500">운영 메모</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="처리 사유·조치 내용을 남겨주세요 (완료/기각/경고/제재 시 기록)"
        rows={2}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 outline-none focus:border-zinc-400"
      />

      {/* 처리 액션 — 대기: 검토 시작만 / 처리중: 기각·경고·제재·완료 / 종료: 재오픈 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {r.status === "pending" && (
          <ActionBtn onClick={() => act("review")} disabled={pending} cls="bg-brand text-white">
            검토 시작
          </ActionBtn>
        )}

        {r.status === "reviewing" && (
          <>
            <ActionBtn onClick={() => act("dismiss")} disabled={pending} cls="bg-zinc-200 text-zinc-700">
              기각
            </ActionBtn>
            <ActionBtn
              onClick={() => act("warn")}
              disabled={pending || !r.reportee_id}
              cls="bg-amber-500 text-white"
            >
              ⚠️ 경고
            </ActionBtn>
            <ActionBtn
              onClick={() => act("suspend")}
              disabled={pending || !r.reportee_id}
              cls="bg-rose-600 text-white"
            >
              🚫 계정 제재
            </ActionBtn>
            <ActionBtn onClick={() => act("resolve")} disabled={pending} cls="bg-emerald-600 text-white">
              완료 처리
            </ActionBtn>
          </>
        )}

        {closed && (
          <ActionBtn
            onClick={() => act("review")}
            disabled={pending}
            cls="bg-white text-zinc-600 ring-1 ring-zinc-300"
          >
            재오픈
          </ActionBtn>
        )}

        {pending && <span className="text-[12px] text-zinc-400">처리 중…</span>}
        {err && <span className="text-[12px] text-rose-600">{err}</span>}
      </div>
      {closed && r.resolved_at && (
        <p className="mt-2 text-[11px] text-zinc-400">처리 {formatKstShort(r.resolved_at)}</p>
      )}
    </div>
  );
}

function ChatLog({
  partyId,
  reporterId,
  reporteeId,
}: {
  partyId: string | null;
  reporterId: string | null;
  reporteeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<AdminMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  // 케이스(거래)가 바뀌면 펼침/캐시 초기화
  useEffect(() => {
    setOpen(false);
    setMsgs(null);
    setErr(null);
  }, [partyId]);

  // 연결된 거래(채팅방)가 없는 신고 — 버튼은 보이되 비활성, 이유 안내
  if (!partyId) {
    return (
      <div className="mt-3">
        <p className="mb-1.5 text-[12px] font-semibold text-zinc-500">채팅 로그</p>
        <div className="flex items-center gap-2">
          <button
            disabled
            className="cursor-not-allowed rounded-full bg-zinc-100 px-3 py-1.5 text-[12.5px] font-semibold text-zinc-400"
          >
            💬 채팅 로그 보기
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-zinc-400">
          이 신고엔 연결된 거래 채팅이 없어요. (거래 맥락 없이 접수됐거나 옛 신고)
        </p>
      </div>
    );
  }

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (msgs === null && !loading) {
      setErr(null);
      startLoad(async () => {
        const res = await fetchReportChatLog(partyId);
        if (res.ok) setMsgs(res.messages);
        else setErr(res.error);
      });
    }
  };

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[12px] font-semibold text-zinc-500">채팅 로그</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={toggle}
          className="rounded-full bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-dark"
        >
          💬 채팅 로그 {open ? "접기" : "보기"}
        </button>
        <Link
          href={`/admin/parties/${partyId}` as Route}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-200"
        >
          🧾 거래 상세 ›
        </Link>
      </div>

      {open && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          {loading && msgs === null ? (
            <p className="py-6 text-center text-[12.5px] text-zinc-400">불러오는 중…</p>
          ) : err ? (
            <p className="py-6 text-center text-[12.5px] text-rose-600">{err}</p>
          ) : !msgs || msgs.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-zinc-400">채팅 메시지가 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {msgs.map((m) => {
                if (m.type === "system" || m.system_event) {
                  return (
                    <li
                      key={m.id}
                      className="mx-auto rounded-full bg-white px-3 py-1 text-center text-[11px] text-zinc-500"
                    >
                      {m.content ?? m.system_event}
                    </li>
                  );
                }
                const who =
                  m.sender_id && m.sender_id === reporterId
                    ? { tag: "신고자", cls: "text-blue-600" }
                    : m.sender_id && m.sender_id === reporteeId
                      ? { tag: "피신고자", cls: "text-rose-600" }
                      : null;
                return (
                  <li key={m.id} className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn("text-[12px] font-semibold text-zinc-800", who?.cls)}>
                        {m.sender_nickname ?? "알수없음"}
                      </span>
                      {who && (
                        <span className={cn("text-[10px] font-bold", who.cls)}>· {who.tag}</span>
                      )}
                      <span className="text-[10px] text-zinc-400">{formatKstShort(m.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] text-zinc-700">{m.content}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PartyCard({ role, card }: { role: string; card: ReportPartyCard | null }) {
  if (!card) {
    return (
      <div className="rounded-xl bg-zinc-50 px-3 py-3 text-[12.5px] text-zinc-400">
        {role} 정보를 찾을 수 없어요 (탈퇴/삭제).
      </div>
    );
  }
  const statusBadge = card.suspended
    ? { label: "정지", cls: "bg-rose-100 text-rose-700" }
    : card.is_bot
      ? { label: "봇", cls: "bg-violet-100 text-violet-700" }
      : { label: "정상", cls: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-zinc-400">{role}</span>
        <span className="text-[14px] font-bold text-zinc-900">{card.nickname}</span>
        <span className="text-[11px] text-zinc-500">
          {LEVEL_EMOJI[card.level] ?? "•"} {levelLabel[card.level] ?? card.level}
        </span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", statusBadge.cls)}>
          {statusBadge.label}
        </span>
        <Link
          href={`/admin/members/${card.id}` as Route}
          className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
        >
          회원 정보 보기
        </Link>
      </div>
      <div className="mt-2.5 grid grid-cols-5 overflow-hidden rounded-lg bg-white ring-1 ring-black/[0.05]">
        <MiniStat label="거래" value={card.transaction_count} />
        <MiniStat label="좋아요" value={card.good_review_count} valueClass="text-emerald-600" border />
        <MiniStat label="싫어요" value={card.bad_review_count} border />
        <MiniStat label="경고" value={card.warning_count} valueClass={card.warning_count > 0 ? "text-amber-600" : ""} border />
        <MiniStat label="신고" value={card.report_count} valueClass={card.report_count > 0 ? "text-rose-600" : ""} border />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
  border,
}: {
  label: string;
  value: number;
  valueClass?: string;
  border?: boolean;
}) {
  return (
    <div className={cn("py-2 text-center", border && "border-l border-black/[0.05]")}>
      <p className={cn("text-[15px] font-bold text-zinc-900", valueClass)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  cls,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-50", cls)}
    >
      {children}
    </button>
  );
}
