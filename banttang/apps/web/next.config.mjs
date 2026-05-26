/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // 채팅 이미지 업로드(server action) 10MB까지 허용 — 명세서 E803.
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "k.kakaocdn.net" },
    ],
  },
};

export default nextConfig;
