-- Pulse accesses these tables through its trusted server, not the Supabase Data API.
-- Table owners (the Prisma connection) keep access; other roles require policies.
ALTER TABLE "Playlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Track" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_PlaylistToTrack" ENABLE ROW LEVEL SECURITY;
