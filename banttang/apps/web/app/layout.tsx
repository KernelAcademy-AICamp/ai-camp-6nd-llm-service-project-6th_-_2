import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { TopProgressBar } from "@/components/TopProgressBar";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

export const metadata: Metadata = {
  title: "띵동 — 로컬 공동구매 매칭",
  description: "같이 사서, 우리 동네 사람과 반띵해요.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS 홈 화면 아이콘(apple-touch-icon) — 180은 애플 권장 크기
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
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
  const kakaoEnabled = KAKAO_MAP_KEY && !KAKAO_MAP_KEY.startsWith("your-");
  return (
    <html lang="ko">
      <body>
        <TopProgressBar />
        <ServiceWorkerRegister />
        <QueryProvider>{children}</QueryProvider>
        <ConfirmModal />
        {kakaoEnabled && (
          // 카카오 맵 SDK — autoload=false. 각 컴포넌트가 kakao.maps.load(...)로 로드.
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            async
            src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=services`}
          />
        )}
      </body>
    </html>
  );
}
