-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('ORGANIZATION_SUSPENDED', 'ORGANIZATION_REACTIVATED', 'ORGANIZATION_AI_LIMIT_CHANGED', 'PLATFORM_CONFIG_UPDATED');

-- CreateEnum
CREATE TYPE "AnnouncementTone" AS ENUM ('INFO', 'WARNING');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "platform_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "signupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultAiMonthlyLimit" INTEGER NOT NULL DEFAULT 100,
    "announcement" TEXT,
    "announcementTone" "AnnouncementTone" NOT NULL DEFAULT 'INFO',
    "updatedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "adminEmail" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "organizationId" TEXT,
    "organizationName" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_organizationId_createdAt_idx" ON "admin_audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_createdAt_idx" ON "refresh_tokens"("createdAt");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

