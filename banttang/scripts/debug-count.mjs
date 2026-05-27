import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dir, "../.env.local"), "utf8");
const getEnv = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.replace(/\s*#.*$/, "").trim();

const admin = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});

for (const table of ["parties", "party_participants", "chat_rooms", "chat_messages"]) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  console.log(`${table}: ${count} ${error ? `ERR ${error.message}` : ""}`);
}

const { data: users } = await admin.auth.admin.listUsers({ perPage: 5 });
console.log(`auth.users: ${users?.users?.length ?? 0}`);
for (const u of users?.users ?? []) {
  console.log(`  - ${u.id.slice(0, 8)} ${u.email} home=${JSON.stringify(u.user_metadata?.home)}`);
}
