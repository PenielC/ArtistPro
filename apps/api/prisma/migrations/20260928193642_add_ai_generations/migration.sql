-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('BRIEFING', 'DRAFT', 'CONTENT', 'PRICING');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('STREAMING', 'COMPLETED', 'REFUSED', 'FAILED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "aiMonthlyLimit" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "variant" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "instructions" TEXT,
    "model" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'STREAMING',
    "output" TEXT,
    "stopReason" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generations_organizationId_createdAt_idx" ON "ai_generations"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
