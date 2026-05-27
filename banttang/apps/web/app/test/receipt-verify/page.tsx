"use client";

// 영수증 인증 API 디버그 페이지.
// 영구 화면 아님 — DB/env 세팅 끝나면 chat receipt-sheet에 통합 후 제거.
// 경로: /test/receipt-verify

import { useState } from "react";

export default function ReceiptVerifyTestPage() {
  const [partyId, setPartyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !partyId.trim()) return;
    setSubmitting(true);
    setStatus(null);
    setResponse(null);
    setElapsed(null);

    const started = performance.now();
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("party_id", partyId.trim());
      const res = await fetch("/api/receipts/verify", {
        method: "POST",
        body: fd,
      });
      setStatus(res.status);
      const ct = res.headers.get("content-type") ?? "";
      setResponse(ct.includes("json") ? await res.json() : await res.text());
    } catch (err) {
      setResponse({ fetch_error: err instanceof Error ? err.message : String(err) });
    } finally {
      setElapsed(Math.round(performance.now() - started));
      setSubmitting(false);
    }
  }

  const statusColor =
    status === null
      ? "bg-gray-100 text-gray-600"
      : status === 200
        ? "bg-emerald-100 text-emerald-800"
        : status === 409
          ? "bg-amber-100 text-amber-800"
          : status >= 500
            ? "bg-rose-100 text-rose-800"
            : "bg-orange-100 text-orange-800";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-xl font-bold text-gray-900">영수증 인증 API 테스트</h1>
        <p className="mt-1 text-sm text-gray-500">
          POST <code className="rounded bg-gray-100 px-1.5 py-0.5">/api/receipts/verify</code>
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-gray-800">party_id</span>
          <input
            type="text"
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            placeholder="0323431-... (UUID)"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            required
          />
          <span className="mt-1 block text-xs text-gray-500">
            본인이 호스트인 파티 UUID. parties 테이블에서 확인.
          </span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-gray-800">영수증 이미지</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
            required
          />
          {file && (
            <span className="mt-1 block text-xs text-gray-500">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)}MB · {file.type}
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={submitting || !file || !partyId.trim()}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? "검증 중..." : "인증 요청"}
        </button>
      </form>

      {(status !== null || response !== null) && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>
              HTTP {status ?? "—"}
            </span>
            {elapsed !== null && (
              <span className="text-xs text-gray-500">{elapsed}ms</span>
            )}
          </div>
          <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-emerald-200">
            {typeof response === "string"
              ? response
              : (JSON.stringify(response, null, 2) as string)}
          </pre>
        </section>
      )}

      <details className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <summary className="cursor-pointer font-semibold">테스트 시나리오</summary>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          <li>같은 영수증 2번 → 두 번째 <code>409 ALREADY_REDEEMED</code></li>
          <li>다른 가게 영수증 → <code>422 PARTY_MISMATCH</code> (상호 불일치)</li>
          <li>delivery 파티에 마트 영수증 → <code>422 PARTY_MISMATCH</code> (카테고리)</li>
          <li>호스트 아닌 계정으로 → <code>403 FORBIDDEN</code></li>
          <li>1분에 4번 호출 → 4번째 <code>429 RATE_LIMITED</code> (Upstash 설정 시)</li>
          <li>흐린 이미지 → <code>422 LOW_CONFIDENCE</code> + Slack 알림</li>
        </ul>
      </details>
    </main>
  );
}
