-- Additive application data only. Supabase Auth owns credentials and is not altered.
-- Keep data-model creation and browser-role revocation atomic.
BEGIN;

CREATE TYPE "FriendConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED');

CREATE TABLE "AccountProfile" (
  "id" UUID NOT NULL,
  "displayName" VARCHAR(24) NOT NULL,
  "friendCode" VARCHAR(18) NOT NULL,
  "libraryOwnerId" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountProfile_friendCode_key" ON "AccountProfile"("friendCode");
CREATE UNIQUE INDEX "AccountProfile_libraryOwnerId_key" ON "AccountProfile"("libraryOwnerId");

CREATE TABLE "FriendConnection" (
  "id" UUID NOT NULL,
  "lowId" UUID NOT NULL,
  "highId" UUID NOT NULL,
  "requesterId" UUID NOT NULL,
  "status" "FriendConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FriendConnection_canonical_pair" CHECK ("lowId" < "highId"),
  CONSTRAINT "FriendConnection_requester_member" CHECK ("requesterId" IN ("lowId", "highId")),
  CONSTRAINT "FriendConnection_lowId_fkey" FOREIGN KEY ("lowId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendConnection_highId_fkey" FOREIGN KEY ("highId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FriendConnection_lowId_highId_key" ON "FriendConnection"("lowId", "highId");
CREATE INDEX "FriendConnection_requesterId_status_idx" ON "FriendConnection"("requesterId", "status");
CREATE INDEX "FriendConnection_highId_status_idx" ON "FriendConnection"("highId", "status");

CREATE TABLE "AccountActionAttempt" (
  "id" UUID NOT NULL,
  "profileId" UUID NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountActionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountActionAttempt_action" CHECK ("action" IN ('FRIEND_REQUEST', 'ROOM_INVITATION')),
  CONSTRAINT "AccountActionAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccountActionAttempt_profileId_action_createdAt_idx" ON "AccountActionAttempt"("profileId", "action", "createdAt");

CREATE TABLE "RoomInvitation" (
  "id" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "roomCode" VARCHAR(6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoomInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoomInvitation_distinct_members" CHECK ("senderId" <> "recipientId"),
  CONSTRAINT "RoomInvitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RoomInvitation_senderId_recipientId_roomCode_key" ON "RoomInvitation"("senderId", "recipientId", "roomCode");
CREATE INDEX "RoomInvitation_recipientId_expiresAt_idx" ON "RoomInvitation"("recipientId", "expiresAt");

CREATE TABLE "LibraryImport" (
  "id" UUID NOT NULL,
  "profileId" UUID NOT NULL,
  "sourceOwnerId" VARCHAR(80) NOT NULL,
  "importedCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LibraryImport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LibraryImport_profileId_sourceOwnerId_key" ON "LibraryImport"("profileId", "sourceOwnerId");

-- No browser/Data API access, including authenticated Supabase users. Only the
-- trusted Prisma role (table owner or dedicated BYPASSRLS backend role) accesses these.
ALTER TABLE "AccountProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FriendConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountActionAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoomInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LibraryImport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AccountProfile", "FriendConnection", "AccountActionAttempt", "RoomInvitation", "LibraryImport" FROM PUBLIC;
-- Keep this migration usable with plain PostgreSQL for local/integration tests.
DO $$
DECLARE browser_role TEXT;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AccountProfile", "FriendConnection", "AccountActionAttempt", "RoomInvitation", "LibraryImport" FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
