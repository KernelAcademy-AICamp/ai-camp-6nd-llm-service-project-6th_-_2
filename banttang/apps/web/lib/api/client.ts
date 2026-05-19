// FastAPI(보조 서버) 호출 래퍼.
// 호출 가능한 도메인: OCR, 알림톡, 선착순 매칭, 결제 콜백, 크롤링 결과 조회 등.
// 단순 CRUD는 Supabase를 직접 쓰고 여기 추가하지 말 것.

const BASE_URL = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ?? "http://localhost:8000";

export class FastApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "FastApiError";
  }
}

export async function fastApiFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new FastApiError(res.status, body, `FastAPI ${res.status}: ${path}`);
  }

  return (await res.json()) as T;
}
