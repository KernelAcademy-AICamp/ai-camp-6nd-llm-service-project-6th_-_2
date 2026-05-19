import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
