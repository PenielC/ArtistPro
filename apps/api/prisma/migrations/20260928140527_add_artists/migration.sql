-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "artistId" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "artistId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "artistId" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "artistId" TEXT;

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagline" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "photoUrl" TEXT,
    "bookingEmail" TEXT,
    "bookingPhone" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "tiktok" TEXT,
    "youtube" TEXT,
    "spotify" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artists_organizationId_idx" ON "artists"("organizationId");

-- CreateIndex
CREATE INDEX "bookings_artistId_idx" ON "bookings"("artistId");

-- CreateIndex
CREATE INDEX "contracts_artistId_idx" ON "contracts"("artistId");

-- CreateIndex
CREATE INDEX "invoices_artistId_idx" ON "invoices"("artistId");

-- CreateIndex
CREATE INDEX "quotes_artistId_idx" ON "quotes"("artistId");

-- AddForeignKey
ALTER TABLE "artists" ADD CONSTRAINT "artists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
