# 핫딜 애그리게이터 (커뮤니티 크롤링) — 분석 & 적용 설계

> 입력: `hotdeal_crawl_reference_1.html` (크롤 레퍼런스, 참조 repo: krepe90/user-hotdeal-bot)
> 상태: 분석 / 결정 대기
> 관련: 현재 임시 핫딜 탭(공구+저가쇼핑, [StoreFeedTabs](../apps/web/components/StoreFeedTabs.tsx)) → 이 설계로 대체/보강

## 1. 설계서 요약

매시간 cron이 **7개 커뮤니티 게시판**을 단순 HTTP GET으로 가져와 HTML/RSS 파싱 → 정규화 → dedup → `deals` upsert. 헤드리스 브라우저 없음. Next.js는 **읽기만**.

| 소스 | URL | 형식 | 비고 |
|---|---|---|---|
| 루리웹 예판핫딜 | `bbs.ruliweb.com/market/board/1020` | HTML (+RSS `/1020/rss`) | |
| 뽐뿌(국내) | `ppomppu.co.kr/zboard/zboard.php?id=ppomppu` | HTML · cp949 | |
| 뽐뿌(해외) | `…?id=ppomppu4` | HTML · cp949 | |
| 클리앙 알뜰구매 | `clien.net/service/board/jirum` | HTML | |
| 쿨엔조이 알뜰구매 | `coolenjoy.net/rss.php?bo_table=jirum` | **RSS · XML** | |
| 퀘이사존 | `quasarzone.com/bbs/qb_saleinfo` | HTML | |
| 아카라이브 핫딜 | `arca.live/b/hotdeal` | HTML | |

공통 추출: **제목·카테고리·작성자·추천·댓글·가격·배송·종료여부·상세URL**. upsert 키 `(source_id, source_article_id)`. 공통 동작: `redirect:'manual'`, `TextDecoder('euc-kr')`, supabase-js upsert.

흐름: `pg_cron(매시) → pg_net → Edge Function(fetch·parse·normalize·dedup) → Postgres(deals) → Next RSC read`.

## 2. banttang 적합성 판단

- **장점**: CLAUDE.md가 이미 "혜택정보 크롤링 스케줄러"를 로드맵에 둠. 스토어 = "혜택·쿠폰·정보" 공간이라 핫딜 피드는 결이 맞음. 재방문 유인(매시 갱신되는 신선한 콘텐츠).
- **주의**: 이 핫딜들은 **전자제품 등 범용·비위치기반**이라 banttang 코어(1인가구 위치 매칭·공동구매)와는 결이 다름. → "딜 정보 큐레이션" 보조 기능으로 자리매김. 우리 **공구(전환 목표)는 핫딜 탭 상단에 고정**하고 크롤 핫딜을 그 아래 두는 게 제품상 맞음.
- **⚠ 법적/ToS 리스크(중요)**: 뽐뿌·루리웹·클리앙 등은 **스크래핑 금지 약관**이 있을 수 있고, 제목/본문은 저작물. 상업 서비스에서 무단 수집·재배포는 분쟁 소지. **완화책**: ① RSS 우선(공식 제공), ② 원문 링크백(detail_url로 트래픽 환원, 본문 미저장·제목+메타만), ③ 저빈도 크롤·robots.txt 준수·UA 명시, ④ 출처 표기. **법무 검토 후 진행 권장.**

## 3. 적용 아키텍처 (banttang 버전)

설계서의 흐름을 banttang의 **기존 패턴에 맞춰** 변형:

```
pg_cron(매시 20분) → pg_net → /api/internal/refresh-hotdeals (CRON_SECRET)
   → 소스별 GET·파싱·정규화·dedup → hotdeals upsert
스토어 핫딜 탭 → hotdeals 테이블 read (RSC) → 카드(원문 링크아웃)
```

### 런타임 선택 (결정 필요)
| 안 | 설명 | 장 / 단 |
|---|---|---|
| **A. Next 내부 라우트** (권장) | `refresh-feeds`·`refresh-recommendations`와 동일 패턴 | 기존 인프라(CRON_SECRET·Vault·pg_net) 재사용 / 웹앱에 크롤 로직 혼재, Node euc-kr 디코딩·HTML 파서 의존성 |
| B. Supabase Edge Function | 설계서 원안(Deno) | DB 인접·Deno TextDecoder euc-kr 기본 지원 / banttang 미사용 런타임 신규 도입·배포 추가 |
| C. FastAPI 워커 | CLAUDE.md 지정처("크롤링 스케줄러=FastAPI") | Python 파싱(bs4/feedparser) 강력 / apps/api 활성화·Railway 배포 surface 추가 |

→ **A 권장**: 이미 `pg_cron→pg_net→/api/internal/*`가 돌고 있어 추가 인프라 0. Node 20은 full-ICU라 `TextDecoder('euc-kr'|'cp949')` 동작. HTML 파서만 추가(`node-html-parser`, 경량).

### 데이터 모델 — `hotdeals`
```sql
CREATE TABLE hotdeals (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id          text NOT NULL,            -- 'ppomppu' | 'ruliweb' | 'coolenjoy' ...
  source_article_id  text NOT NULL,
  title              text NOT NULL,
  category           text,
  price              integer,                  -- 파싱 가능 시
  shipping           text,
  author             text,
  votes              integer NOT NULL DEFAULT 0,
  comments           integer NOT NULL DEFAULT 0,
  is_ended           boolean NOT NULL DEFAULT false,
  thumbnail          text,
  detail_url         text NOT NULL,
  posted_at          timestamptz,
  crawled_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_article_id)
);
CREATE INDEX idx_hotdeals_recent ON hotdeals(is_ended, posted_at DESC);
-- RLS: 공개 read(미종료), service_role write
```
> 설계서의 `price_history`·`bookmarks`는 2차(가격 추이·찜). MVP는 `hotdeals`만.

### 크롤러 구조
- `lib/hotdeal/sources/<source>.ts` — 소스별 파서(셀렉터는 설계서 그대로). 입력 HTML/RSS → `RawDeal[]`.
- `lib/hotdeal/fetch.ts` — GET + `TextDecoder` 디코딩(소스별 인코딩), `redirect:'manual'`.
- `lib/hotdeal/normalize.ts` — 공통 스키마로 정규화 + dedup 키 생성.
- `api/internal/refresh-hotdeals/route.ts` — 소스 루프(하나 실패해도 나머지 진행), upsert. `maxDuration` 넉넉히.
- **소스 격리**: 한 소스 파싱 실패가 전체를 막지 않게 try/catch per-source(설계서 의도와 동일).

## 4. 현재 핫딜 탭과의 관계

지금 핫딜 탭 = **공구(할인율) + 동네 저가 쇼핑**(임시). 적용 후:
- **공구는 그대로 상단 고정**(우리 인벤토리·전환 목표).
- 그 아래 **크롤 핫딜**(hotdeals) 섹션 추가. 카드 클릭 → 원문 커뮤니티(detail_url) 새 탭.
- 동네 저가 쇼핑은 유지하거나 크롤 핫딜로 대체(결정).

## 5. 단계 (제안)

1. **RSS부터** — 쿨엔조이(RSS)·루리웹(RSS) 2소스로 시작. RSS는 구조 안정·ToS 친화적. (HTML 스크래핑보다 깨질 위험·법적 리스크 ↓)
2. 마이그레이션 `hotdeals` + RLS + pg_cron.
3. 내부 라우트 + RSS 파서 2개 + upsert.
4. 스토어 핫딜 탭에 hotdeals 섹션 연결(공구 상단 고정 + 크롤 핫딜).
5. 검증·모니터링(소스별 수집 수 로깅) 후 **HTML 소스 점진 확대**.
6. (2차) 가격 추이·찜·카테고리 필터.

## 7. 구현 현황 (2026-06-17)

라이브 검증 후 소스별 상태:

| 소스 | 방식 | 상태 | 비고 |
|---|---|---|---|
| 쿨엔조이 | RSS | ✅ 적용 | URL은 `/bbs/rss.php`(설계서 `/rss.php`는 404) |
| 루리웹 | RSS | ✅ 적용 | `/market/board/1020/rss`, 28건 확인 |
| 퀘이사존 | HTML | ✅ 적용 | `a.subject-link`, 31건 |
| 뽐뿌(국내) | HTML(cp949) | ✅ 적용 | `a.baseList-title`, 수집 수 적음(페이지 구조상) |
| 뽐뿌(해외) | HTML | ⛔ 제외 | 딜·Q&A 혼재 노이즈 |
| 클리앙 | HTML | ⛔ 보류 | 목록이 정적 HTML에 없음(JS/봇 게이트 추정) |
| 아카라이브 | HTML | ⛔ 보류 | 403 봇 차단(Cloudflare 추정) — 헤드리스 필요 |

> 설계서의 행 셀렉터는 대부분 사이트 개편으로 낡아, **제목 앵커 클래스 기반**으로 재도출함(`node-html-parser`). 클리앙·아카라이브는 단순 GET+파싱으로 불가 → 헤드리스/우회는 ToS·리스크 커서 보류.

## 6. 결정이 필요한 항목
- **Q1. 런타임** — A(Next 내부 라우트, 권장) / B(Edge Function) / C(FastAPI).
- **Q2. 소스 범위** — RSS 2개로 시작(권장) / 7개 전체.
- **Q3. 핫딜 탭 구성** — 공구 상단 고정 + 크롤 핫딜(권장) / 크롤 핫딜만.
- **Q4. 법무** — 스크래핑 ToS·저작권 검토 여부(특히 HTML 소스 확대 전). RSS·링크백·메타만 저장으로 리스크 최소화.
