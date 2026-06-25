// 운영자 — 단일 모집글 상세 + 참여자 전원 + 채팅 전문(읽기 전용).
// 멤버가 아니어도 service client로 모든 메시지를 그대로 본다.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getPartyDetailForAdmin } from "@/lib/admin-queries";
import {
  displayStatusLabel,
  displayStatusColor,
  categoryLabel,
  formatKstShort,
} from "@/lib/party-status";
import { cn } from "@/lib/utils";
import { AdminDeleteButton } from "@/app/admin/_components/delete-button";

export const dynamic = "force-dynamic";

export default async function AdminPartyDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const detail = await getPartyDetailForAdmin(params.id);
  if (!detail) notFound();
  const { party, participants, messages } = detail;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-zinc-50 p-4">
      <div className="flex items-center justify-between">
        <Link href={"/admin" as any} className="text-xs text-zinc-500">
          ‹ 전체 모집글
        </Link>
        <AdminDeleteButton
          kind="party"
          id={party.id}
          label="모집글 삭제"
          confirmText="이 모집글을 삭제할까요? 참여자·채팅·영수증까지 모두 삭제되며 되돌릴 수 없어요."
          redirectTo="/admin"
        />
      </div>

      {/* 모집글 헤더 */}
      <section className="rounded-2xl border border-black/[0.04] bg-white p-4">
        <div className="flex items-center gap-1.5">
          <h1 className="text-base font-bold text-zinc-900">{party.store_name}</h1>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              displayStatusColor[party.display_status],
            )}
          >
            {displayStatusLabel[party.display_status]}
          </span>
        </div>
        {party.representative_menu && (
          <p className="mt-1 text-sm text-zinc-600">{party.representative_menu}</p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          <div>분류: {categoryLabel[party.category] ?? party.category}</div>
          <div>
            정원: {party.occupied_count}/{party.max_participants}명
          </div>
          <div>1인 금액: {party.price_per_person?.toLocaleString() ?? 0}원</div>
          <div>거래: {formatKstShort(party.deal_at)}</div>
          <div className="col-span-2 text-[11px] text-zinc-400">party_id: {party.id}</div>
        </dl>
      </section>

      {/* 참여자 */}
      <section className="rounded-2xl border border-black/[0.04] bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">참여자 ({participants.length})</h2>
        <ul className="flex flex-col gap-1.5">
          {participants.map((pt) => (
            <li key={pt.user_id} className="flex items-center gap-2 text-[13px]">
              <span className="font-medium text-zinc-800">{pt.nickname ?? "?"}</span>
              {pt.is_host && (
                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
                  호스트
                </span>
              )}
              <span className="text-[11px] text-zinc-400">{pt.level}</span>
              <span className="ml-auto text-[11px] text-zinc-500">{pt.status}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 채팅 전문 */}
      <section className="rounded-2xl border border-black/[0.04] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-zinc-900">채팅 전문 ({messages.length})</h2>
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-zinc-400">메시지가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) =>
              m.type === "system" || m.system_event ? (
                <li
                  key={m.id}
                  className="mx-auto rounded-full bg-zinc-100 px-3 py-1 text-center text-[11px] text-zinc-500"
                >
                  {m.content ?? m.system_event}
                </li>
              ) : (
                <li key={m.id} className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-zinc-800">
                      {m.sender_nickname ?? "알수없음"}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {formatKstShort(m.created_at)}
                    </span>
                  </div>
                  <p className="text-[13px] text-zinc-700">{m.content}</p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
