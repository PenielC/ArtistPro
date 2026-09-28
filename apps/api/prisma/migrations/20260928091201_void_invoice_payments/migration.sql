-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);
