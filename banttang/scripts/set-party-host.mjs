// 일회성 dev 스크립트: 특정 파티의 host를 주어진 이메일 사용자로 교체.
//
// 실행:
//   node --env-file=apps/web/.env.local scripts/set-party-host.mjs <partyId> <email>
//
// 동작:
//   1) 이메일 사용자를 찾거나(없으면) email_confirm=true로 생성
//   2) 프로필 row 보장 (nickname/gender/neighborhood)
//   3) 현재 호스트의 party_participants를 cancelled로 강등
//   4) 새 호스트를 is_host=true approved로 upsert
//   5) parties.host_id 업데이트

import { createClient } from "@supabase/supabase-js";

const [, , partyIdArg, emailArg] = process.argv;
if (!partyIdArg || !emailArg) {
  console.error("usage: node --env-file=apps/web/.env.local scripts/set-party-host.mjs <partyId> <email>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}

const DEFAULT_PASSWORD = "123456"; // 사용자가 새로 생성될 경우의 기본 비밀번호

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findOrCreateUser(email) {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    console.log(`[found] existing user ${existing.id}`);
    // 미인증이면 강제 confirm
    if (!existing.email_confirmed_at) {
      const { error: upErr } = await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
      });
      if (upErr) throw upErr;
      console.log(`[confirm] email_confirm = true`);
    }
    return existing;
  }
  const { data, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  console.log(`[create] new user ${data.user.id} (password=${DEFAULT_PASSWORD})`);
  return data.user;
}

async function ensureProfile(userId, email) {
  const base = email.split("@")[0].replace(/[^가-힣a-zA-Z0-9_]/g, "").slice(0, 8) || "user";
  // nickname unique 충돌 가능 → 충돌 시 suffix
  for (let attempt = 0; attempt < 5; attempt++) {
    const nickname = attempt === 0 ? base : (base + Math.floor(Math.random() * 1000).toString().padStart(3, "0")).slice(0, 10);
    const { error } = await admin.from("profiles").upsert(
      {
        id: userId,
        nickname,
        gender: "prefer_not_to_say",
        neighborhood_id: "00000000-0000-0000-0000-000000000001",
      },
      { onConflict: "id" },
    );
    if (!error) {
      console.log(`[profile] nickname=${nickname}`);
      return;
    }
    if (error.code !== "23505" && !/unique/i.test(error.message ?? "")) throw error;
  }
  throw new Error("profile nickname unique 충돌 — 재시도 5회 실패");
}

async function swapHost(partyId, newHostId) {
  // 현재 party와 기존 host
  const { data: party, error: pErr } = await admin
    .from("parties")
    .select("id, host_id, status, max_participants")
    .eq("id", partyId)
    .single();
  if (pErr) throw pErr;
  console.log(`[party] current host_id=${party.host_id} status=${party.status}`);

  if (party.host_id === newHostId) {
    console.log(`[skip] 이미 ${newHostId}가 호스트입니다.`);
    return;
  }

  // 기존 호스트의 participant row 강등
  const { error: demoteErr } = await admin
    .from("party_participants")
    .update({
      status: "cancelled",
      is_host: false,
      cancelled_at: new Date().toISOString(),
    })
    .eq("party_id", partyId)
    .eq("user_id", party.host_id);
  if (demoteErr) throw demoteErr;
  console.log(`[demote] 기존 host 강등 완료`);

  // 새 호스트 upsert (is_host=true, approved)
  const { error: upErr } = await admin
    .from("party_participants")
    .upsert(
      {
        party_id: partyId,
        user_id: newHostId,
        status: "approved",
        is_host: true,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "party_id,user_id" },
    );
  if (upErr) throw upErr;
  console.log(`[promote] 새 host participant row upsert`);

  // parties.host_id 갱신
  const { error: phErr } = await admin
    .from("parties")
    .update({ host_id: newHostId })
    .eq("id", partyId);
  if (phErr) throw phErr;
  console.log(`[party] host_id → ${newHostId}`);
}

(async () => {
  try {
    const user = await findOrCreateUser(emailArg);
    await ensureProfile(user.id, emailArg);
    await swapHost(partyIdArg, user.id);
    console.log("\n✓ 완료. 새로고침해서 확인하세요.");
  } catch (err) {
    console.error("ERR:", err);
    process.exit(1);
  }
})();
