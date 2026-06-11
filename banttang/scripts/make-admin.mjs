// 띵동 슈퍼 계정(운영자) 생성기
// 1) 일반 가입 플로우로 운영자 계정을 만들고(이미 있으면 로그인만),
// 2) profiles.is_admin = true 로 승격한다.
//
// 승격은 Supabase REST(PATCH)로 직접 수행한다. 이를 위해 service 키가 필요하다:
//   SUPABASE_URL (= NEXT_PUBLIC_SUPABASE_URL)  와  SUPABASE_SECRET_KEY
// 두 값이 없으면 계정만 만들고, 대시보드 SQL 에디터에 붙여넣을 SQL 한 줄을 출력한다.
//
// 실행 예:
//   BASE_URL=https://ttingdong.vercel.app \
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=eyJ... \
//   node scripts/make-admin.mjs
//
// 기본 자격증명(원하면 env로 덮어쓰기):
//   ADMIN_EMAIL=admin@ttingdong.test  ADMIN_PASSWORD=ttingdong!admin1  ADMIN_NICKNAME=관리자

const BASE_URL = (process.env.BASE_URL || "https://ttingdong.vercel.app").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL || "admin@ttingdong.test";
const PASSWORD = process.env.ADMIN_PASSWORD || "ttingdong!admin1";
const NICKNAME = process.env.ADMIN_NICKNAME || "관리자";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function jsonOf(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function main() {
  console.log(`\n🛎  띵동 슈퍼 계정 생성 → ${BASE_URL}\n`);

  // 1) 가입 시도 → 이미 있으면 로그인으로 폴백
  let res = await fetch(`${BASE_URL}/api/auth/email-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, nickname: NICKNAME, gender: "prefer_not_to_say" }),
  });
  if (res.ok) {
    console.log(`  ✓ 가입 완료 (${EMAIL} / 닉네임 ${NICKNAME})`);
  } else {
    const signin = await fetch(`${BASE_URL}/api/auth/email-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!signin.ok) {
      const err = await jsonOf(signin);
      throw new Error(`인증 실패: ${err.error ?? signin.status}`);
    }
    console.log(`  ✓ 기존 계정 로그인 (${EMAIL})`);
  }

  // 2) is_admin 승격
  if (!SUPABASE_URL || !SUPABASE_SECRET) {
    console.log("\n⚠ SUPABASE_URL / SUPABASE_SECRET_KEY 가 없어서 자동 승격을 건너뜁니다.");
    console.log("  아래 SQL을 Supabase 대시보드 → SQL Editor 에서 1회 실행하세요:\n");
    console.log(`    update profiles set is_admin = true where nickname = '${NICKNAME}';\n`);
    console.log(`  그 다음 ${BASE_URL} 에서 ${EMAIL} 로 로그인 → /admin 접속.`);
    return;
  }

  const patch = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?nickname=eq.${encodeURIComponent(NICKNAME)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SECRET,
        Authorization: `Bearer ${SUPABASE_SECRET}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_admin: true }),
    },
  );
  if (!patch.ok) {
    const err = await jsonOf(patch);
    throw new Error(`is_admin 승격 실패: ${err.message ?? patch.status} (마이그레이션 적용 여부 확인)`);
  }
  const rows = await jsonOf(patch);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`승격 대상 프로필을 못 찾음 (닉네임 ${NICKNAME})`);
  }

  console.log(`\n✅ 운영자 승격 완료 — is_admin = true`);
  console.log(`   로그인: ${BASE_URL} (${EMAIL} / 비번 ${PASSWORD})`);
  console.log(`   접속:   ${BASE_URL}/admin\n`);
}

main().catch((e) => {
  console.error("\n❌ 실패:", e.message);
  process.exit(1);
});
