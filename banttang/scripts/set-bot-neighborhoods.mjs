// 봇 10명을 두 동네(신림동·역삼1동)로 정리한다.
// profiles.neighborhood_id 를 바꾸고, 각 봇이 이미 쓴 community_posts 의 동네도 같이 맞춰
// 게시판이 동네별로 일관되게 보이도록 한다. (커뮤니티는 같은 동네 글만 노출되므로)
//
// 실행:
//   node --env-file=apps/web/.env.local scripts/set-bot-neighborhoods.mjs

import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 이메일 → 동네 이름. 신림동 15명 / 역삼1동 15명.
const ASSIGN = {
  // ── 신림동 (01~04, 09, 11~20) ──
  "bot01.jieun@ttingdong.test": "신림동",
  "bot02.minhyuk@ttingdong.test": "신림동",
  "bot03.sua@ttingdong.test": "신림동",
  "bot04.taekyung@ttingdong.test": "신림동",
  "bot09.haneul@ttingdong.test": "신림동",
  "bot11.jaehyun@ttingdong.test": "신림동",
  "bot12.soyeon@ttingdong.test": "신림동",
  "bot13.jihoon@ttingdong.test": "신림동",
  "bot14.yuna@ttingdong.test": "신림동",
  "bot15.hyunwoo@ttingdong.test": "신림동",
  "bot16.daeun@ttingdong.test": "신림동",
  "bot17.sangmin@ttingdong.test": "신림동",
  "bot18.yeji@ttingdong.test": "신림동",
  "bot19.jongseok@ttingdong.test": "신림동",
  "bot20.harin@ttingdong.test": "신림동",
  // ── 역삼1동 (05~08, 10, 21~30) ──
  "bot05.junho@ttingdong.test": "역삼1동",
  "bot06.boram@ttingdong.test": "역삼1동",
  "bot07.donghyun@ttingdong.test": "역삼1동",
  "bot08.yerin@ttingdong.test": "역삼1동",
  "bot10.sungwoo@ttingdong.test": "역삼1동",
  "bot21.taeho@ttingdong.test": "역삼1동",
  "bot22.miju@ttingdong.test": "역삼1동",
  "bot23.gunwoo@ttingdong.test": "역삼1동",
  "bot24.seoyoung@ttingdong.test": "역삼1동",
  "bot25.jungmin@ttingdong.test": "역삼1동",
  "bot26.nakyung@ttingdong.test": "역삼1동",
  "bot27.woojin@ttingdong.test": "역삼1동",
  "bot28.chaewon@ttingdong.test": "역삼1동",
  "bot29.dongwook@ttingdong.test": "역삼1동",
  "bot30.subin@ttingdong.test": "역삼1동",
};

async function main() {
  // 동네 이름 → id
  const names = [...new Set(Object.values(ASSIGN))];
  const { data: nbs, error: nbErr } = await admin.from("neighborhoods").select("id, name").in("name", names);
  if (nbErr) throw nbErr;
  const nbId = Object.fromEntries((nbs ?? []).map((n) => [n.name, n.id]));
  for (const n of names) if (!nbId[n]) throw new Error(`neighborhoods에 '${n}' 없음`);
  console.log("동네 id:", nbId);

  // 이메일 → userId
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const idByEmail = Object.fromEntries((list?.users ?? []).map((u) => [u.email, u.id]));

  for (const [email, nbName] of Object.entries(ASSIGN)) {
    const uid = idByEmail[email];
    if (!uid) {
      console.log(`  ⚠ ${email}: 계정 없음`);
      continue;
    }
    const targetNb = nbId[nbName];
    const { error: pe } = await admin.from("profiles").update({ neighborhood_id: targetNb }).eq("id", uid);
    // 이 봇이 쓴 글도 같은 동네로 이동(게시판 일관성)
    const { data: moved, error: ce } = await admin
      .from("community_posts")
      .update({ neighborhood_id: targetNb })
      .eq("author_id", uid)
      .select("id");
    console.log(`  ✓ ${email.replace("@ttingdong.test", "")} → ${nbName}` + (moved?.length ? ` (글 ${moved.length}개 이동)` : "") + (pe || ce ? ` ✗ ${(pe || ce).message}` : ""));
  }

  // 결과 요약
  const { data: profs } = await admin
    .from("profiles")
    .select("nickname, neighborhood_id")
    .in("nickname", ["지은이", "민혁", "수아", "태경", "준호", "보람", "동현", "예린", "하늘", "성우"]);
  const nameById = Object.fromEntries((nbs ?? []).map((n) => [n.id, n.name]));
  const dist = {};
  for (const p of profs ?? []) {
    const nm = nameById[p.neighborhood_id] ?? p.neighborhood_id ?? "NULL";
    (dist[nm] ??= []).push(p.nickname);
  }
  console.log("\n=== 정리 후 분포 ===");
  for (const [nm, arr] of Object.entries(dist)) console.log(`  ${nm}: ${arr.join(", ")}`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
