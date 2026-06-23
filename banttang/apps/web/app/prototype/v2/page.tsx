import { notFound } from "next/navigation";
import { PrototypeV2 } from "./PrototypeV2";

// 프로토타입 v2 — 카테고리 큐레이션 + 위치 기반 매칭 흐름 검증용 UI 껍데기.
// 본 서비스 라우트(/feed, /host/new 등)와 분리되어 있고, mock 데이터만 사용.
// production 빌드에서는 노출되지 않게 dev 모드 가드.
export default function PrototypeV2Page() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <PrototypeV2 />;
}
