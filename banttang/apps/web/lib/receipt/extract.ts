// Claude Vision으로 영수증/주문 캡처 추출.
// tool_choice로 extract_receipt 호출 강제 → Zod 검증으로 응답 모양 보장.
// system prompt + tool 정의는 정적이므로 prompt caching 적용 (반복 호출 비용 절감).

import Anthropic from "@anthropic-ai/sdk";
import {
  MODEL_ID,
  ReceiptExtractionSchema,
  SYSTEM_PROMPT,
  TOOL_DESCRIPTION,
  TOOL_INPUT_JSON_SCHEMA,
  TOOL_NAME,
  type ReceiptExtraction,
} from "./schema";

// 빌드 타임에 API 키 없어도 import만으로 깨지지 않게 lazy init.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface ExtractInput {
  // 클라이언트에서 리사이즈된 이미지 base64. data: URL prefix는 자동으로 제거함.
  imageBase64: string;
  mediaType: SupportedMediaType;
}

export interface ExtractSuccess {
  ok: true;
  data: ReceiptExtraction;
  modelUsed: string;
  durationMs: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export type ExtractFailureReason =
  | "api_error" // Anthropic API 호출 자체가 실패 (네트워크, 4xx/5xx, 인증 등)
  | "wrong_tool" // 응답에 tool_use가 없거나 다른 도구 호출
  | "invalid_schema"; // tool 응답이 Zod 검증 통과 못 함

export interface ExtractFailure {
  ok: false;
  reason: ExtractFailureReason;
  message: string;
  modelUsed: string;
  durationMs: number;
}

export type ExtractResult = ExtractSuccess | ExtractFailure;

// data: URL prefix 들어와도 받아서 raw base64로 정규화.
function stripDataUrlPrefix(s: string): string {
  const m = s.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : s;
}

export async function extractReceipt(
  input: ExtractInput,
): Promise<ExtractResult> {
  const startedAt = Date.now();
  const client = getClient();
  const base64 = stripDataUrlPrefix(input.imageBase64);

  try {
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      // system prompt는 정적 → 캐시 대상. tools 블록이 앞에 오므로
      // system 끝에 cache_control을 두면 tools+system이 한 번에 캐시된다.
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          input_schema:
            TOOL_INPUT_JSON_SCHEMA as unknown as Anthropic.Tool["input_schema"],
        },
      ],
      // 강제로 extract_receipt만 호출. 일반 텍스트 응답 금지.
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: "이 이미지에 대해 extract_receipt 도구로 결과를 반환하라.",
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      return {
        ok: false,
        reason: "wrong_tool",
        message: `${TOOL_NAME} 도구 호출이 응답에 없음 (stop_reason=${response.stop_reason})`,
        modelUsed: MODEL_ID,
        durationMs: Date.now() - startedAt,
      };
    }

    const parsed = ReceiptExtractionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid_schema",
        message: parsed.error.message,
        modelUsed: MODEL_ID,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      ok: true,
      data: parsed.data,
      modelUsed: MODEL_ID,
      durationMs: Date.now() - startedAt,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens:
          response.usage.cache_creation_input_tokens ?? undefined,
        cache_read_input_tokens:
          response.usage.cache_read_input_tokens ?? undefined,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      message: err instanceof Error ? err.message : String(err),
      modelUsed: MODEL_ID,
      durationMs: Date.now() - startedAt,
    };
  }
}
