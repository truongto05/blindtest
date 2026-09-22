CREATE TYPE "PlaylistVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

ALTER TABLE "Playlist"
  ADD COLUMN "visibility" "PlaylistVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "shareId" TEXT;

CREATE UNIQUE INDEX "Playlist_shareId_key" ON "Playlist"("shareId");
CREATE INDEX "Playlist_visibility_createdAt_idx" ON "Playlist"("visibility", "createdAt");

ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_visibility_shareId_check"
  CHECK (
    ("visibility" = 'PRIVATE' AND "shareId" IS NULL)
    OR ("visibility" <> 'PRIVATE' AND "shareId" IS NOT NULL)
  );
