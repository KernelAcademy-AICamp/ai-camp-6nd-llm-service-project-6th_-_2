-- 영수증 OCR 인증 — 중복 인증 방지 데이터 모델 (명세서 v2 §5)
-- partial unique index 2개에 WHERE 절 수동 추가됨 (Prisma 스키마로 표현 불가).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RedemptionResult" AS ENUM ('success', 'duplicate', 'low_confidence', 'not_receipt', 'extract_failed', 'error');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "supabase_user_id" UUID NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_redemptions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "source_type" TEXT NOT NULL,
    "order_id" TEXT,
    "fallback_key" TEXT,
    "total_amount" INTEGER NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemption_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "result" "RedemptionResult" NOT NULL,
    "source_type" TEXT,
    "order_id" TEXT,
    "fallback_key" TEXT,
    "total_amount" INTEGER,
    "paid_at" TIMESTAMPTZ,
    "is_receipt_confidence" DECIMAL(4,3),
    "extraction_confidence" DECIMAL(4,3),
    "model_used" TEXT,
    "image_sha256" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemption_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_user_id_key" ON "users"("supabase_user_id");

-- CreateIndex
CREATE INDEX "idx_redeem_user_time" ON "receipt_redemptions"("user_id", "created_at");

-- CreateIndex (partial unique) — 메인: 같은 주문번호로 두 번 인증 차단
CREATE UNIQUE INDEX "uq_redeem_order"
    ON "receipt_redemptions"("source_type", "order_id")
    WHERE "order_id" IS NOT NULL;

-- CreateIndex (partial unique) — 폴백: 주문번호 없을 때 거래 키로 차단
CREATE UNIQUE INDEX "uq_redeem_fallback"
    ON "receipt_redemptions"("fallback_key")
    WHERE "order_id" IS NULL AND "fallback_key" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_logs_user_time" ON "redemption_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_logs_result_time" ON "redemption_logs"("result", "created_at");

-- AddForeignKey
ALTER TABLE "receipt_redemptions" ADD CONSTRAINT "receipt_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_logs" ADD CONSTRAINT "redemption_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
