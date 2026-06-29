// 띵동 최소 서비스 워커 — PWA 설치 가능 조건(매니페스트 + fetch 핸들러) 충족용.
// 네트워크를 가로채지 않는 no-op fetch 핸들러(존재 자체가 설치 가능 판정에 필요).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
