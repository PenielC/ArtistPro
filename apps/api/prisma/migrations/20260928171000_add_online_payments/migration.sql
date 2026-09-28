-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYNOW', 'TEST');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "publicToken" TEXT;

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "currency" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "integrationKeyEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentAccountId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "pollUrl" TEXT,
    "redirectUrl" TEXT,
    "payerEmail" TEXT,
    "failureReason" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "invoicePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_organizationId_provider_currency_key" ON "payment_accounts"("organizationId", "provider", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_reference_key" ON "payment_attempts"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_invoicePaymentId_key" ON "payment_attempts"("invoicePaymentId");

-- CreateIndex
CREATE INDEX "payment_attempts_organizationId_idx" ON "payment_attempts"("organizationId");

-- CreateIndex
CREATE INDEX "payment_attempts_invoiceId_idx" ON "payment_attempts"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_publicToken_key" ON "invoices"("publicToken");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoicePaymentId_fkey" FOREIGN KEY ("invoicePaymentId") REFERENCES "invoice_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

