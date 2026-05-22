#!/usr/bin/env node
// Supabase 연결/스키마 스모크 테스트
// 사용: node scripts/test-supabase.mjs
// .env.local 의 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY 사용

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env.local");

function loadEnv(path) {
  const env = {};
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    // strip inline comment: first ` #` (space + #) outside of quotes
    const hashIdx = value.search(/\s#/);
    if (hashIdx >= 0) value = value.slice(0, hashIdx);
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.SUPABASE_SECRET_KEY;

const results = [];
function ok(name, detail = "") {
  results.push({ status: "PASS", name, detail });
  console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ status: "FAIL", name, detail });
  console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`);
}
function warn(name, detail = "") {
  results.push({ status: "WARN", name, detail });
  console.log(`WARN  ${name}${detail ? "  — " + detail : ""}`);
}

console.log("=== Supabase 스모크 테스트 ===\n");

// 1) ENV 검증
if (!URL || URL.includes("your-project")) fail("ENV: NEXT_PUBLIC_SUPABASE_URL", "값이 비어있거나 예시 그대로");
else ok("ENV: NEXT_PUBLIC_SUPABASE_URL", URL.replace(/^https?:\/\//, "").split(".")[0]);

if (!PUBLISHABLE || PUBLISHABLE.startsWith("sb_publishable_...")) fail("ENV: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "값이 비어있거나 예시 그대로");
else if (!PUBLISHABLE.startsWith("sb_publishable_")) warn("ENV: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "신규 키 prefix(sb_publishable_)가 아님 — 레거시 JWT일 수 있음");
else ok("ENV: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_... 형식");

if (!SECRET || SECRET.startsWith("sb_secret_...")) warn("ENV: SUPABASE_SECRET_KEY", "비어있음 — admin 검증 일부 스킵");
else if (!SECRET.startsWith("sb_secret_")) warn("ENV: SUPABASE_SECRET_KEY", "신규 키 prefix(sb_secret_)가 아님");
else ok("ENV: SUPABASE_SECRET_KEY", "sb_secret_... 형식");

if (!URL || !PUBLISHABLE) {
  console.log("\n필수 ENV가 비어 있어 종료합니다.");
  process.exit(1);
}

// 2) Anon(publishable) 클라이언트로 connectivity
const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });

try {
  const { data, error } = await anon.auth.getSession();
  if (error) fail("Anon: auth.getSession()", error.message);
  else ok("Anon: auth.getSession()", `세션 ${data.session ? "있음" : "없음(정상)"}`);
} catch (e) {
  fail("Anon: auth.getSession()", e.message);
}

// 3) v_parties_with_stats 뷰 조회 (CLAUDE.md: 홈 피드는 이 뷰 사용)
try {
  const { data, error } = await anon.from("v_parties_with_stats").select("id").limit(1);
  if (error) fail("Anon: v_parties_with_stats 조회", error.message);
  else ok("Anon: v_parties_with_stats 조회", `row ${data?.length ?? 0}건 반환`);
} catch (e) {
  fail("Anon: v_parties_with_stats 조회", e.message);
}

// 4) Anon이 profiles 직접 SELECT — RLS 정책에 따라 결과 갈림. 401/403 안 나면 OK.
try {
  const { error } = await anon.from("profiles").select("id").limit(1);
  if (error && /JWT|api key|invalid/i.test(error.message)) fail("Anon: profiles select", error.message);
  else ok("Anon: profiles select", "(RLS 무관 — 인증 자체는 통과)");
} catch (e) {
  fail("Anon: profiles select", e.message);
}

// 5) Secret 클라이언트(서비스 롤)로 스키마 자세히 검증
if (SECRET && SECRET.startsWith("sb_secret_")) {
  const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

  const expectedTables = [
    "neighborhoods", "pickup_locations", "profiles", "terms_agreements",
    "parties", "party_photos", "party_participants",
    "chat_rooms", "chat_messages", "receipts", "payments",
    "reviews", "reports", "notifications", "phase2_alerts",
  ];
  for (const t of expectedTables) {
    try {
      const { error, count } = await admin.from(t).select("*", { count: "exact", head: true });
      if (error) fail(`Schema: table ${t}`, error.message);
      else ok(`Schema: table ${t}`, `row count = ${count ?? "?"}`);
    } catch (e) {
      fail(`Schema: table ${t}`, e.message);
    }
  }

  const expectedViews = ["v_parties_with_stats", "v_user_trust_stats"];
  for (const v of expectedViews) {
    try {
      const { error } = await admin.from(v).select("*", { head: true, count: "exact" });
      if (error) fail(`Schema: view ${v}`, error.message);
      else ok(`Schema: view ${v}`, "OK");
    } catch (e) {
      fail(`Schema: view ${v}`, e.message);
    }
  }

  // Storage buckets
  try {
    const { data, error } = await admin.storage.listBuckets();
    if (error) fail("Storage: listBuckets()", error.message);
    else {
      const names = (data || []).map((b) => b.id);
      for (const b of ["party-photos", "receipts", "profile-images"]) {
        if (names.includes(b)) ok(`Storage: bucket ${b}`, "exists");
        else fail(`Storage: bucket ${b}`, "없음 — migration 20260520000003 미적용 가능성");
      }
    }
  } catch (e) {
    fail("Storage: listBuckets()", e.message);
  }
} else {
  warn("Secret 키 미설정", "스키마/스토리지 상세 검증 스킵");
}

console.log("\n=== 요약 ===");
const pass = results.filter((r) => r.status === "PASS").length;
const failN = results.filter((r) => r.status === "FAIL").length;
const warnN = results.filter((r) => r.status === "WARN").length;
console.log(`PASS ${pass} / FAIL ${failN} / WARN ${warnN}`);
process.exit(failN > 0 ? 1 : 0);
