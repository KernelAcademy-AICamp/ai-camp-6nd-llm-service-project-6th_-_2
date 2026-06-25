// AI 추천 — LLM 재정렬 + 추천 이유 (생성 단계).
// 후보(candidates.ts)를 성향 프로필과 함께 Claude에 넘겨 재정렬 + 후보별 한 줄 이유.
//   · tool_choice 강제 + zod 검증 (lib/receipt/extract.ts 패턴)
//   · system 지침은 정적 → prompt caching
//   · 환각 차단: LLM 반환 ref 를 후보 화이트리스트와 대조, 모르는 건 폐기
//   · 콜드스타트/후보 0/LLM 실패 → 후보 원래 순서 폴백(이유 없음)
//   docs/ai-recommendation-rag.md §3, §9

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Candidate, RecProfile } from "./candidates";

export const RECO_MODEL_ID = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type RankedItem = { ref: string; type: Candidate["type"]; reason: string };

const TOOL_NAME = "rank_recommendations";

// 모델은 후보의 짧은 정수 id 만 주고받는다(긴 naver URL ref echo 방지 → 출력 토큰 급감).
const RankSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), reason: z.string() })),
});

const SYSTEM_PROMPT = `너는 위치 기반 1인 가구 공동구매 앱 '반띵'의 추천 큐레이터다.
사용자의 성향과 후보 목록을 받아, 이 사용자에게 좋은 순서로 후보를 재정렬하고
각 후보에 "왜 추천하는지" 한 줄 이유(한국어, 40자 내외, 친근한 말투)를 붙인다.

규칙:
- 반드시 입력 후보의 id(정수) 만 사용한다. 없는 id·새 상품·가격을 지어내지 마라.
- 이유는 후보의 사실(제목·카테고리·가격)과 사용자 성향에 근거해야 한다. 과장 금지.
- 모집중인 공구(type=groupbuy/party)는 거래 성사로 이어지는 우리 인벤토리다. 성향에 맞으면 앞쪽에 둔다.
- 성향 정보가 거의 없으면 무리해서 끼워맞추지 말고 일반적인 가치(가성비·신선함 등)로 담백하게.
- 모든 후보를 한 번씩만 포함한다. 결과는 rank_recommendations 도구로만 반환한다.`;

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "추천 순서(좋은 순)대로 정렬한 후보 목록.",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", description: "입력 후보의 id(정수)를 그대로." },
          reason: { type: "string", description: "추천 이유 한 줄(한국어, 40자 내외)." },
        },
        required: ["id", "reason"],
      },
    },
  },
  required: ["items"],
} as const;

// 성향 프로필 조회 → 프롬프트용 텍스트. user_tags + favorite_categories + 최근 검색 키워드.
async function buildPropensityText(profile: RecProfile): Promise<string> {
  const admin = createAdminClient();
  const [tagsRes, evRes] = await Promise.all([
    admin
      .from("user_tags")
      .select("tag, evidence")
      .eq("user_id", profile.id)
      .order("confidence", { ascending: false })
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    admin
      .from("user_events")
      .select("keyword")
      .eq("user_id", profile.id)
      .in("kind", ["search", "click"])
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
  ]);

  const tags = ((tagsRes.data ?? []) as { tag: string; evidence: string }[])
    .map((t) => `- ${t.evidence}`)
    .join("\n");
  const keywords = Array.from(
    new Set(((evRes.data ?? []) as { keyword: string }[]).map((e) => e.keyword?.trim()).filter(Boolean)),
  ).slice(0, 10);

  const lines: string[] = [];
  lines.push(`동네: ${profile.neighborhood?.name ?? "미설정"}`);
  if (profile.favoriteCategories.length) lines.push(`관심사: ${profile.favoriteCategories.join(", ")}`);
  if (tags) lines.push(`성향 태그:\n${tags}`);
  if (keywords.length) lines.push(`최근 검색/클릭: ${keywords.join(", ")}`);
  return lines.join("\n") || "(성향 정보 거의 없음 — 콜드스타트)";
}

/**
 * 후보를 LLM으로 재정렬 + 이유 부여. 실패/콜드스타트면 후보 순서 그대로 폴백.
 * 반환 items 는 항상 입력 후보의 부분집합(검증 통과 ref) + 누락 후보 append.
 */
export async function generateRecommendations(
  profile: RecProfile,
  candidates: Candidate[],
): Promise<{ items: RankedItem[]; model: string; fallback: boolean }> {
  const fallbackItems = (): RankedItem[] =>
    candidates.map((c) => ({ ref: c.ref, type: c.type, reason: "" }));

  if (candidates.length === 0) return { items: [], model: RECO_MODEL_ID, fallback: true };

  let propensity: string;
  try {
    propensity = await buildPropensityText(profile);
  } catch {
    propensity = "(성향 조회 실패)";
  }

  // 후보를 LLM 입력용으로 압축(id·title·section·price·마감). id=배열 인덱스(긴 ref 미노출).
  const candidateLines = candidates
    .map((c, i) =>
      [
        `id=${i}`,
        `종류=${c.type}`,
        `제목=${c.title}`,
        c.section ? `카테고리=${c.section}` : null,
        c.price != null ? `가격=${c.price.toLocaleString("ko-KR")}원` : null,
        c.deadline ? `마감=${c.deadline}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");

  const userBlock = `[사용자 성향]\n${propensity}\n\n[후보 ${candidates.length}개]\n${candidateLines}`;

  try {
    const response = await getClient().messages.create({
      model: RECO_MODEL_ID,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [
        {
          name: TOOL_NAME,
          description: "재정렬된 추천 후보와 이유를 반환한다.",
          input_schema: TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: userBlock }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    const parsed = toolUse ? RankSchema.safeParse(toolUse.input) : null;
    if (!parsed?.success) {
      console.error("[reco] tool_use 파싱 실패 → 폴백", { stop: response.stop_reason, hasTool: !!toolUse });
      return { items: fallbackItems(), model: RECO_MODEL_ID, fallback: true };
    }

    // 환각 차단: 후보 배열 범위 내 id 만 채택, 중복 제거.
    const used = new Set<string>();
    const items: RankedItem[] = [];
    for (const it of parsed.data.items) {
      const cand = candidates[it.id];
      if (!cand || used.has(cand.ref)) continue;
      used.add(cand.ref);
      items.push({ ref: cand.ref, type: cand.type, reason: (it.reason ?? "").trim().slice(0, 60) });
    }
    // LLM이 빠뜨린 후보는 원래 순서로 뒤에 append(이유 없음).
    for (const c of candidates) {
      if (!used.has(c.ref)) items.push({ ref: c.ref, type: c.type, reason: "" });
    }

    return { items, model: RECO_MODEL_ID, fallback: false };
  } catch (e) {
    // 폴백을 조용히 삼키지 않는다 — 키 누락·모델·네트워크 원인을 로그로 남긴다.
    const err = e as { status?: number; message?: string };
    console.error("[reco] LLM 호출 실패 → 폴백(이유 없음)", err?.status ?? "", err?.message ?? e);
    return { items: fallbackItems(), model: RECO_MODEL_ID, fallback: true };
  }
}
