-- CreateTable
CREATE TABLE "epks" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "discography" JSONB NOT NULL DEFAULT '[]',
    "performances" JSONB NOT NULL DEFAULT '[]',
    "pressQuotes" JSONB NOT NULL DEFAULT '[]',
    "gallery" JSONB NOT NULL DEFAULT '[]',
    "media" JSONB NOT NULL DEFAULT '[]',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "epks_artistId_key" ON "epks"("artistId");

-- AddForeignKey
ALTER TABLE "epks" ADD CONSTRAINT "epks_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
