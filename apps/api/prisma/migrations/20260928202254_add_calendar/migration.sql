-- CreateEnum
CREATE TYPE "CalendarEntryKind" AS ENUM ('REHEARSAL', 'STUDIO', 'TRAVEL', 'RELEASE', 'MEETING', 'BLOCKED', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendarFeedToken" TEXT;

-- CreateTable
CREATE TABLE "calendar_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "artistId" TEXT,
    "createdById" TEXT,
    "kind" "CalendarEntryKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_entries_organizationId_startDate_idx" ON "calendar_entries"("organizationId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "users_calendarFeedToken_key" ON "users"("calendarFeedToken");

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

