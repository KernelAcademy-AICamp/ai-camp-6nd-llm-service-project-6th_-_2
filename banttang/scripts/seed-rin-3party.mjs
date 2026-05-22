// 일회성 dev 스크립트: SEED_HOST_EMAIL 을 호스트로 하는 3인 정원 파티 생성 +
// 다른 2명을 즉시 approved로 채워서 정원 충족 → 트리거가 채팅방 자동 오픈
//
// 실행:
//   SEED_HOST_EMAIL=you@example.com SEED_HOST_PASSWORD=yourpw \
//     node --env-file=apps/web/.env.local scripts/seed-rin-3party.mjs

import { createClient } from "@supabase/supabase-js";

const HOST_EMAIL = process.env.SEED_HOST_EMAIL;
const HOST_PASSWORD = process.env.SEED_HOST_PASSWORD;
const NEIGHBORHOOD_ID = "00000000-0000-0000-0000-000000000001"; // 신림동 (seed)
const FILLER_USERS = [
  { id: "22222222-2222-2222-2222-222222222222", email: "user2@test.com", nickname: "민들레", gender: "female" },
  { id: "33333333-3333-3333-3333-333333333333", email: "user3@test.com", nickname: "나무",   gender: "female" },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}
if (!HOST_EMAIL || !HOST_PASSWORD) {
  console.error("missing env: SEED_HOST_EMAIL / SEED_HOST_PASSWORD");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findOrCreateUser(email, fixedId = null) {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    if (!existing.email_confirmed_at) {
      await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
    }
    return existing;
  }
  const payload = { email, password: HOST_PASSWORD, email_confirm: true };
  if (fixedId) payload.id = fixedId; // admin createUser는 id를 받지 않음 → 무시되어 신규 UUID로 생성됨
  const { data, error: cErr } = await admin.auth.admin.createUser(payload);
  if (cErr) throw cErr;
  return data.user;
}

async function ensureProfileFromEmail(userId, email) {
  const base = email.split("@")[0].replace(/[^가-힣a-zA-Z0-9_]/g, "").slice(0, 8) || "user";
  for (let attempt = 0; attempt < 5; attempt++) {
    const nickname = attempt === 0 ? base : (base + Math.floor(Math.random() * 1000).toString().padStart(3, "0")).slice(0, 10);
    const { error } = await admin.from("profiles").upsert(
      { id: userId, nickname, gender: "prefer_not_to_say", neighborhood_id: NEIGHBORHOOD_ID },
      { onConflict: "id" },
    );
    if (!error) return nickname;
    if (error.code !== "23505" && !/unique/i.test(error.message ?? "")) throw error;
  }
  throw new Error("profile nickname unique 충돌 — 5회 실패");
}

async function ensureFillerProfileById({ id, nickname, gender }) {
  // 기존 시드(test_scenario.sql)가 이미 fixed UUID로 profile/auth.users를 만들었으므로
  // 그대로 재사용한다. 실제 로그인은 안 되지만 party_participants의 user_id로는 유효.
  const { data: existing, error: selErr } = await admin
    .from("profiles")
    .select("id, nickname")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  // 없으면 생성 시도 (auth.users에 해당 id가 없으면 FK 위반으로 실패할 수 있음)
  const { error } = await admin.from("profiles").upsert(
    { id, nickname, gender, neighborhood_id: NEIGHBORHOOD_ID },
    { onConflict: "id" },
  );
  if (error) throw new Error(`filler profile (${nickname}) 실패: ${error.message}`);
  return id;
}

async function pickPickupLocation() {
  const { data, error } = await admin
    .from("pickup_locations")
    .select("id, name")
    .eq("neighborhood_id", NEIGHBORHOOD_ID)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureNeighborhood() {
  const { data, error } = await admin
    .from("neighborhoods")
    .select("id")
    .eq("id", NEIGHBORHOOD_ID)
    .maybeSingle();
  if (error) throw error;
  if (data) return;
  console.log("[neighborhood] seed가 없음 — 신림동을 직접 삽입합니다.");
  const { error: insErr } = await admin
    .from("neighborhoods")
    .insert({
      id: NEIGHBORHOOD_ID,
      sido: "서울특별시",
      sigungu: "관악구",
      dong: "신림동",
      is_beta: true,
    });
  if (insErr) throw new Error(`neighborhood seed 실패: ${insErr.message}`);
}

async function createParty({ hostId, pickupLocationId }) {
  const now = new Date();
  const dealAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h
  const deadline = new Date(dealAt.getTime() - 60 * 60 * 1000); // -1h
  const row = {
    host_id: hostId,
    neighborhood_id: NEIGHBORHOOD_ID,
    category: "delivery",
    store_name: "교촌치킨 신림점",
    representative_menu: "허니콤보 + 콜라 1.25L",
    max_participants: 3,
    price_per_person: 11000,
    deal_at: dealAt.toISOString(),
    apply_deadline_at: deadline.toISOString(),
    approval_type: "auto",
    gender_option: "all",
    pickup_location_id: pickupLocationId,
    paid_by_host: true,
    status: "recruiting",
  };
  const { data, error } = await admin.from("parties").insert(row).select("id").single();
  if (error) throw new Error(`parties insert 실패: ${error.message}`);
  return data.id;
}

async function addHostParticipant(partyId, hostId) {
  // 트리거가 자동 등록을 안 했을 경우를 대비해 upsert.
  const { error } = await admin
    .from("party_participants")
    .upsert(
      {
        party_id: partyId,
        user_id: hostId,
        status: "approved",
        is_host: true,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "party_id,user_id" },
    );
  if (error) throw new Error(`host participant 실패: ${error.message}`);
}

async function addApprovedParticipant(partyId, userId, label) {
  const { error } = await admin
    .from("party_participants")
    .upsert(
      {
        party_id: partyId,
        user_id: userId,
        status: "approved",
        is_host: false,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "party_id,user_id" },
    );
  if (error) throw new Error(`participant (${label}) 실패: ${error.message}`);
}

(async () => {
  try {
    console.log("[1/6] neighborhood 확인");
    await ensureNeighborhood();

    console.log("[2/6] 호스트 사용자 확인/생성");
    const host = await findOrCreateUser(HOST_EMAIL);
    const hostNickname = await ensureProfileFromEmail(host.id, HOST_EMAIL);
    console.log(`  → ${host.id} (nickname=${hostNickname})`);

    console.log("[3/6] filler 2명 확인 (기존 시드 프로필 재사용)");
    const fillerIds = [];
    for (const f of FILLER_USERS) {
      const uid = await ensureFillerProfileById(f);
      fillerIds.push({ uid, nickname: f.nickname });
      console.log(`  → ${f.nickname} = ${uid}`);
    }

    console.log("[4/6] pickup location 선택");
    const pickup = await pickPickupLocation();
    console.log(`  → ${pickup ? `${pickup.name} (${pickup.id})` : "(없음 — pickup_location_id null로 진행)"}`);

    console.log("[5/6] 파티 생성 (max=3, recruiting)");
    const partyId = await createParty({
      hostId: host.id,
      pickupLocationId: pickup?.id ?? null,
    });
    console.log(`  → party_id = ${partyId}`);

    console.log("[6/6] 참여자 3명 approved 추가 (host + filler 2명)");
    await addHostParticipant(partyId, host.id);
    for (const { uid, nickname } of fillerIds) {
      await addApprovedParticipant(partyId, uid, nickname);
    }
    console.log("  → 정원 3/3 충족 → 트리거가 chat_room 자동 오픈");

    // 후속 검증
    const { data: openedRoom } = await admin
      .from("chat_rooms")
      .select("id, opened_at")
      .eq("party_id", partyId)
      .maybeSingle();
    console.log(
      openedRoom
        ? `\n✓ chat_room 생성됨: ${openedRoom.id} (opened_at=${openedRoom.opened_at})`
        : `\n⚠ chat_room이 아직 없음 — 트리거 미설치/오류 가능성`,
    );

    console.log(`\n접속: http://localhost:3000/parties/${partyId}`);
  } catch (err) {
    console.error("ERR:", err.message ?? err);
    process.exit(1);
  }
})();
