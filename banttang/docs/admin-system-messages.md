# 시스템 메시지 관리 (운영자) — 기획

> 입력: `chat-system-messages.pdf` (채팅방 시스템 메시지 카탈로그, 기준 2026-06-24)
> 상태: 기획 / 결정 대기
> 패턴 참고: `tag_rules`(운영자가 코드 수정 없이 임계값 조정) — 같은 "DB 템플릿 + 코드는 읽기만" 구조.

## 1. 배경 (PDF 분석)

채팅방에 자동 삽입되는 시스템 메시지가 **13종 + 미발생 2종**, 4개 그룹:

| 그룹 | 예시 케이스 | 식별자(kind/event) |
|---|---|---|
| 모집/거래 진행 | 모집완료·거래방오픈, 거래완료, 주문취소, 퇴장/강퇴 | `chat_opened`·`party_completed`·`party_cancelled`·`member_left/kicked` |
| 장소/픽업 | 반띵 장소 변경, 중간지점 추천 | `pickup_changed`·`midpoint_recommendation` |
| 영수증/정산 | 영수증 등록, 확인 요청, 인증 요청 | `receipt_uploaded`·`receipt_confirm_prompt`·`receipt_request` |
| 봇/띵동 | 아보카도 봇 입장 안내(+거래유형 4종), 띵동 안내, 띵동 도착 | `avocado_notice`·`avocado_doorbell`·`doorbell_ring` |
| (미발생) | 거래 30분 전 / 10분 전 | `before_30min`·`before_10min` (enum만, 삽입 코드 없음) |

각 메시지 특성:
- **표시 문구**에 `{변수}` 치환 — `{닉네임}`·`{장소명}`·`{금액}`·`{가게}` 등.
- **노출 대상** = `metadata.recipient`: 전원 / 호스트(`host`) / 멤버(`member`).
- **type** = `chat_messages.type`(system / receipt_card), **event** = `system_event` enum.
- 문구가 **소스 하드코딩**(party-lifecycle.ts·verify-receipt-claude.ts·avocado-notice.ts·chat-timeline.tsx 등).

## 2. 목표

운영자가 **코드 배포 없이** 시스템 메시지의 ① 문구 ② 노출 대상 ③ on/off 를 관리. 발생 로직(언제 삽입할지)은 코드 그대로 두고, **문구·메타만 DB에서 읽는다.**

## 3. 데이터 모델 — `system_message_templates`

```sql
CREATE TABLE system_message_templates (
  key         text PRIMARY KEY,          -- 'party_completed' 등 (kind 또는 event)
  category    text NOT NULL,             -- 'progress'|'pickup'|'receipt'|'bot'
  label       text NOT NULL,             -- '거래 완료'
  template    text NOT NULL,             -- '거래가 완료되었어요. 서로 평가를 남겨주세요!'
  audience    text NOT NULL DEFAULT 'all', -- all|host|member (metadata.recipient)
  variables   text[] NOT NULL DEFAULT '{}', -- 허용 {변수} 목록(편집 검증·힌트)
  msg_type    text NOT NULL DEFAULT 'system', -- chat_messages.type (system|receipt_card)
  enabled     boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id)
);
```
- **시드**: PDF의 현재 문구·대상·변수를 그대로 1회 INSERT(소스 = 진실의 원천 이전).
- **거래유형 4종(4-1)**: `avocado_notice` 본문 + 유형별 1줄. → 별도 키 `avocado_notice_delivery_each` 등 4행으로 두거나, `variables`에 유형 분기 텍스트를 jsonb로. **결정 필요(Q4).**

## 4. 렌더링·삽입 리팩터

중앙 헬퍼 `lib/chat/system-message.ts`:
```ts
// 템플릿 조회(메모리 캐시) → {변수} 치환 → {text, recipient, type}
export async function renderSystemMessage(key, vars): Promise<{text; recipient; type} | null>
```
- 각 삽입 지점(_actions/*)이 하드코딩 문자열 대신 `renderSystemMessage(key, vars)` 호출.
- **폴백**: DB 미적용·행 없음·`enabled=false`면 **번들된 기본 문구(DEFAULTS)**로. 즉 DB가 비어도 현재와 동일하게 동작(안전).
- **캐시**: 템플릿은 거의 안 변함 → 메모리 캐시 + 저장 시 무효화(또는 짧은 TTL).
- `enabled=false`면 그 메시지는 **삽입 생략**(운영자가 특정 안내 끄기).

## 5. 변수 안전성

- 키마다 **허용 변수 집합**(`variables`)이 고정. 편집기는 그 변수만 칩으로 제공.
- 저장 시 템플릿의 `{...}` 가 허용 목록에 없으면 **경고/차단**(오타로 치환 실패 방지).
- 미치환 변수는 렌더 시 빈 문자열 또는 원문 유지(택1) — 깨진 메시지 방지.

## 6. 운영 화면 (`/admin/messages`)

- 사이드바 **"시스템 메시지"** 추가(대시보드·회원·게시판 옆/아래).
- 그룹(모집/거래·장소·영수증·봇)별 카드 목록. 각 행:
  - 케이스 라벨 + 대상 배지(전원/호스트/멤버) + on/off 토글
  - 현재 문구(미리보기) + 사용 변수 칩
  - 편집(✎) → 패널/모달: 문구 textarea + 변수 칩 삽입 + **실시간 미리보기**(샘플 변수) + 대상 select + 저장
- 저장 = 서버 액션(requireAdmin) → upsert + 캐시 무효화 + 감사(updated_by).

## 7. 단계
1. **마이그레이션** `system_message_templates` + 시드(현재 문구).
2. **헬퍼·DEFAULTS** `lib/chat/system-message.ts` (DB 읽기 + 폴백).
3. **운영 화면** `/admin/messages`(목록·편집·미리보기) + 서버 액션 + 사이드바.
4. **삽입 지점 리팩터** — 점진: 자주 바뀌는 문구(봇 안내·영수증)부터 헬퍼로 교체, 나머지는 폴백으로 유지.

**MVP = 1~3** (운영자가 문구 보고/편집 가능). 4는 교체된 메시지부터 실제 반영.

## 8. 결정 필요
- **Q1. 편집 범위** — 문구만 / 문구+대상+on/off (권장).
- **Q2. 리팩터 방식** — 전체 일괄 교체 / 점진(폴백 유지, 권장).
- **Q3. 변수 위반** — 허용 외 변수 저장 차단 / 경고만 허용.
- **Q4. 거래유형 4종** — 별도 4행 / 한 템플릿 jsonb 분기.
