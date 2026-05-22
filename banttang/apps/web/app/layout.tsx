import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "띵동 — 로컬 공동구매 매칭",
  description: "같이 사서, 우리 동네 사람과 반띵해요.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "띵동",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#7FB069",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const kakaoSrc =
    kakaoKey && !kakaoKey.startsWith("your-")
      ? `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&autoload=false&libraries=services`
      : null;
  return (
    <html lang="ko">
      <head>
        {/* 카카오 지도 SDK 미리 받아두기 — 실제 실행은 컴포넌트의 Script 태그가 담당 */}
        {kakaoSrc && <link rel="preload" as="script" href={kakaoSrc} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
