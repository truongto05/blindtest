CREATE TABLE "Playlist" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Track" (
  "deezerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "coverUrl" TEXT NOT NULL,
  "previewUrl" TEXT NOT NULL,
  CONSTRAINT "Track_pkey" PRIMARY KEY ("deezerId")
);
CREATE TABLE "_PlaylistToTrack" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_PlaylistToTrack_AB_unique" ON "_PlaylistToTrack"("A", "B");
CREATE INDEX "_PlaylistToTrack_B_index" ON "_PlaylistToTrack"("B");
CREATE INDEX "Playlist_ownerId_createdAt_idx" ON "Playlist"("ownerId", "createdAt");
ALTER TABLE "_PlaylistToTrack" ADD CONSTRAINT "_PlaylistToTrack_A_fkey" FOREIGN KEY ("A") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PlaylistToTrack" ADD CONSTRAINT "_PlaylistToTrack_B_fkey" FOREIGN KEY ("B") REFERENCES "Track"("deezerId") ON DELETE CASCADE ON UPDATE CASCADE;
