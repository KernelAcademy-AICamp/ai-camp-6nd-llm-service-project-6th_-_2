import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

export const metadata: Metadata = {
  title: "반띵 — 1인 가구 공동구매 매칭",
  description: "같은 동네 1인 가구끼리 장보기·배달을 같이.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "반띵",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6b35",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <QueryProvider>{children}</QueryProvider>
        <ConfirmModal />
        {/* 카카오 맵 SDK — autoload=false. 각 컴포넌트가 kakao.maps.load(...)로 로드. */}
        {KAKAO_MAP_KEY && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            async
            src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`}
          />
        )}
      </body>
    </html>
  );
}
