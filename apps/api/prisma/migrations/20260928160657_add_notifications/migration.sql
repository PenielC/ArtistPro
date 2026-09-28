-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('INVOICE', 'QUOTE', 'CONTRACT', 'PAYMENT_RECEIPT', 'PAYMENT_ALERT', 'INVOICE_REMINDER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_RECEIVED', 'EMAIL_FAILED', 'REMINDERS_SENT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "reminderDays" INTEGER[] DEFAULT ARRAY[1, 7, 14]::INTEGER[],
ADD COLUMN     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "ctaUrl" TEXT,
    "ctaLabel" TEXT,
    "invoiceId" TEXT,
    "quoteId" TEXT,
    "contractId" TEXT,
    "createdById" TEXT,
    "dedupeKey" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_dedupeKey_key" ON "email_messages"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_messages_organizationId_idx" ON "email_messages"("organizationId");

-- CreateIndex
CREATE INDEX "email_messages_invoiceId_idx" ON "email_messages"("invoiceId");

-- CreateIndex
CREATE INDEX "email_messages_quoteId_idx" ON "email_messages"("quoteId");

-- CreateIndex
CREATE INDEX "email_messages_contractId_idx" ON "email_messages"("contractId");

-- CreateIndex
CREATE INDEX "email_messages_status_idx" ON "email_messages"("status");

-- CreateIndex
CREATE INDEX "user_notifications_userId_readAt_idx" ON "user_notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
