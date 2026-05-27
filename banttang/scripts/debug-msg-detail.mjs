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

const roomId = "a0ce5eb0-0508-47bf-a350-aff3379fc025";
const { data } = await admin
  .from("chat_messages")
  .select("*")
  .eq("room_id", roomId)
  .eq("type", "system");

for (const m of data ?? []) {
  console.log(JSON.stringify(m, null, 2));
  console.log("---");
}
