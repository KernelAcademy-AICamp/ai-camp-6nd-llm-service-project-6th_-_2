import { NextResponse } from "next/server";

// 이미지 프록시 — 외부(네이버) 이미지를 서버에서 받아 같은 출처로 돌려준다.
// 용도: 반띵 진입 시 카드 이미지를 상품 사진(File)으로 넣을 때 클라이언트의 CORS 차단 회피.
// SSRF 방지: 네이버 이미지 CDN 호스트만 허용.

const ALLOWED_HOST = [/\.pstatic\.net$/, /\.naver\.net$/];

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return new NextResponse("missing url", { status: 400 });

  let host: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return new NextResponse("https only", { status: 400 });
    host = u.host;
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!ALLOWED_HOST.some((re) => re.test(host))) {
    return new NextResponse("forbidden host", { status: 403 });
  }

  try {
    const res = await fetch(raw, { cache: "no-store" });
    if (!res.ok) return new NextResponse("upstream error", { status: 502 });
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("not an image", { status: 415 });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
