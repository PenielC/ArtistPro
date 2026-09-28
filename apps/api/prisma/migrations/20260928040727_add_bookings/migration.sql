-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NEW_ENQUIRY', 'QUALIFIED', 'QUOTE_SENT', 'NEGOTIATION', 'CONTRACT_SENT', 'DEPOSIT_PAID', 'CONFIRMED', 'EVENT', 'COMPLETED', 'PAYMENT_RECEIVED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "eventType" TEXT,
    "eventDate" TIMESTAMP(3),
    "venue" TEXT,
    "fee" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'NEW_ENQUIRY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_organizationId_idx" ON "bookings"("organizationId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
