import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  accountProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  friendConnection: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  accountActionAttempt: {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  libraryImport: { findUnique: vi.fn(), create: vi.fn() },
  playlist: { findMany: vi.fn(), create: vi.fn() },
  roomInvitation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const verified = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma", () => ({ prisma: db }));
vi.mock("./authService", async (original) => ({
  ...(await original<typeof import("./authService")>()),
  verifyAccessToken: verified,
}));
import {
  acceptFriendRequest,
  createRoomInvitation,
  deleteFriendRequest,
  deleteRoomInvitation,
  getAccountProfile,
  importGuestLibrary,
  listFriends,
  listRoomInvitations,
  protectLibraryOwner,
  removeFriend,
  saveAccountProfile,
  sendFriendRequest,
} from "./accountService";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const strangerId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-09-15T12:00:00Z");
const first = {
  id: firstId,
  displayName: "Nina",
  friendCode: "PULSE-111111111111",
  libraryOwnerId: "LIB-SECRET-FIRST",
  createdAt: now,
  updatedAt: now,
};
const second = {
  ...first,
  id: secondId,
  displayName: "Alex",
  friendCode: "PULSE-222222222222",
  libraryOwnerId: "LIB-SECRET-SECOND",
};
const connection = {
  id: requestId,
  lowId: firstId,
  highId: secondId,
  requesterId: firstId,
  status: "PENDING",
  createdAt: now,
  updatedAt: now,
};
const publicSecond = {
  id: secondId,
  displayName: "Alex",
  friendCode: second.friendCode,
  createdAt: now,
};
const conflict = () =>
  new Prisma.PrismaClientKnownRequestError("conflict", {
    code: "P2034",
    clientVersion: "6.19.3",
  });

beforeEach(() => {
  vi.resetAllMocks();
  verified.mockResolvedValue({ id: firstId });
  db.$transaction.mockImplementation((work) => work(db));
  db.accountProfile.findUnique.mockImplementation(
    ({ where }) =>
      [first, second].find((profile) =>
        Object.entries(where).every(
          ([key, value]) => profile[key as keyof typeof profile] === value,
        ),
      ) ?? null,
  );
  db.friendConnection.findUnique.mockResolvedValue(null);
  db.friendConnection.findFirst.mockResolvedValue(null);
  db.friendConnection.findMany.mockResolvedValue([]);
  db.friendConnection.count.mockResolvedValue(0);
  db.friendConnection.create.mockImplementation(({ data }) => ({
    ...connection,
    ...data,
  }));
  db.friendConnection.deleteMany.mockResolvedValue({ count: 1 });
  db.accountActionAttempt.count.mockResolvedValue(0);
  db.libraryImport.findUnique.mockResolvedValue(null);
  db.playlist.findMany.mockResolvedValue([]);
  db.roomInvitation.findUnique.mockResolvedValue(null);
  db.roomInvitation.findMany.mockResolvedValue([]);
  db.roomInvitation.deleteMany.mockResolvedValue({ count: 1 });
  db.roomInvitation.create.mockImplementation(({ data }) => ({
    id: requestId,
    ...data,
  }));
});

describe("account ownership and profile", () => {
  it("keeps guest capability access without calling Auth", async () => {
    expect(await protectLibraryOwner("LIB-GUEST-12345678")).toBe(
      "LIB-GUEST-12345678",
    );
    expect(verified).not.toHaveBeenCalled();
  });
  it("requires verified matching identity for an account library", async () => {
    await expect(
      protectLibraryOwner(first.libraryOwnerId),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      protectLibraryOwner(second.libraryOwnerId, "valid-token"),
    ).rejects.toMatchObject({ status: 403 });
    expect(await protectLibraryOwner(first.libraryOwnerId, "valid-token")).toBe(
      first.libraryOwnerId,
    );
    expect(verified).toHaveBeenCalledWith("valid-token");
  });
  it("does not fall back to a guest if storage fails", async () => {
    db.accountProfile.findUnique.mockRejectedValue(new Error("database down"));
    await expect(protectLibraryOwner(first.libraryOwnerId)).rejects.toThrow(
      "database down",
    );
  });
  it("returns a null profile only for an authenticated account without a profile", async () => {
    expect(await getAccountProfile(strangerId)).toEqual({ profile: null });
    expect(await getAccountProfile(firstId)).toEqual({
      profile: {
        id: firstId,
        displayName: first.displayName,
        friendCode: first.friendCode,
        createdAt: now,
      },
      libraryOwnerId: first.libraryOwnerId,
    });
  });
  it("creates random public codes and independent private library keys, updates only the name", async () => {
    db.accountProfile.upsert.mockResolvedValue(first);
    await saveAccountProfile(firstId, "  Nina  ");
    expect(db.accountProfile.upsert).toHaveBeenCalledWith({
      where: { id: firstId },
      create: {
        id: firstId,
        displayName: "Nina",
        friendCode: expect.stringMatching(/^PULSE-[A-F0-9]{12}$/),
        libraryOwnerId: expect.stringMatching(/^LIB-[A-F0-9]{32}$/),
      },
      update: { displayName: "Nina" },
    });
  });
  it("rejects invalid names before database writes", async () => {
    await expect(saveAccountProfile(firstId, "<script>")).rejects.toThrow();
    await expect(saveAccountProfile(firstId, "x")).rejects.toThrow();
    expect(db.accountProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("explicit guest library import", () => {
  it("copies privately inside one serializable transaction without modifying the originals", async () => {
    db.playlist.findMany.mockResolvedValue([
      { id: requestId, name: "Invitée", tracks: [{ deezerId: "123" }] },
    ]);
    expect(await importGuestLibrary(firstId, "LIB-GUEST-12345678")).toEqual({
      importedCount: 1,
      alreadyImported: false,
    });
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(db.playlist.create).toHaveBeenCalledWith({
      data: {
        name: "Invitée",
        ownerId: first.libraryOwnerId,
        visibility: "PRIVATE",
        tracks: { connect: [{ deezerId: "123" }] },
      },
    });
    expect(db.libraryImport.create).toHaveBeenCalledWith({
      data: {
        profileId: firstId,
        sourceOwnerId: "LIB-GUEST-12345678",
        importedCount: 1,
      },
    });
  });
  it("returns the import receipt and does not duplicate playlists on retry", async () => {
    db.libraryImport.findUnique.mockResolvedValue({ importedCount: 2 });
    expect(await importGuestLibrary(firstId, "LIB-GUEST-12345678")).toEqual({
      importedCount: 2,
      alreadyImported: true,
    });
    expect(db.playlist.create).not.toHaveBeenCalled();
    expect(db.playlist.findMany).not.toHaveBeenCalled();
  });
  it("refuses another account library even if its private key is known", async () => {
    await expect(
      importGuestLibrary(firstId, second.libraryOwnerId),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.playlist.findMany).not.toHaveBeenCalled();
    expect(db.playlist.create).not.toHaveBeenCalled();
  });
  it("does not permanently consume an empty guest library", async () => {
    expect(await importGuestLibrary(firstId, "LIB-GUEST-12345678")).toEqual({
      importedCount: 0,
      alreadyImported: false,
    });
    expect(db.libraryImport.create).not.toHaveBeenCalled();
  });
  it("rejects oversized imports before writing any copy", async () => {
    db.playlist.findMany.mockResolvedValue(
      Array.from({ length: 201 }, () => ({ tracks: [] })),
    );
    await expect(
      importGuestLibrary(firstId, "LIB-GUEST-12345678"),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.playlist.create).not.toHaveBeenCalled();
  });

  it("refuses a legacy playlist exceeding the per-playlist track cap", async () => {
    db.playlist.findMany.mockResolvedValue([
      {
        name: "Trop longue",
        tracks: Array.from({ length: 501 }, (_, index) => ({
          deezerId: String(index),
        })),
      },
    ]);
    await expect(
      importGuestLibrary(firstId, "LIB-GUEST-12345678"),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.playlist.create).not.toHaveBeenCalled();
    expect(db.playlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 201,
        include: { tracks: { select: { deezerId: true }, take: 501 } },
      }),
    );
  });
});

describe("friend requests", () => {
  it("uses one canonical pair and never returns private profile fields", async () => {
    const result = await sendFriendRequest(secondId, first.friendCode);
    expect(db.friendConnection.create).toHaveBeenCalledWith({
      data: {
        lowId: firstId,
        highId: secondId,
        requesterId: secondId,
      },
    });
    expect(JSON.stringify(result)).not.toContain("libraryOwnerId");
    expect(JSON.stringify(result)).not.toContain("LIB-SECRET");
    expect(db.accountActionAttempt.create).toHaveBeenCalledWith({
      data: { profileId: secondId, action: "FRIEND_REQUEST" },
    });
  });
  it("rejects self requests and unknown codes", async () => {
    await expect(
      sendFriendRequest(firstId, first.friendCode),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sendFriendRequest(firstId, "PULSE-999999999999"),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.friendConnection.create).not.toHaveBeenCalled();
  });
  it("deduplicates outgoing requests but never auto-accepts a crossed request", async () => {
    db.friendConnection.findUnique.mockResolvedValue(connection);
    expect(await sendFriendRequest(firstId, second.friendCode)).toEqual({
      request: { id: requestId, profile: publicSecond, createdAt: now },
    });
    await expect(
      sendFriendRequest(secondId, first.friendCode),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.friendConnection.create).not.toHaveBeenCalled();
    expect(db.friendConnection.update).not.toHaveBeenCalled();
  });
  it("rejects new requests at the pending capacity", async () => {
    db.friendConnection.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(0);
    await expect(
      sendFriendRequest(firstId, second.friendCode),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.friendConnection.create).not.toHaveBeenCalled();
  });

  it.each([
    { label: "recipient pending", counts: [0, 100] },
    { label: "sender friends", counts: [0, 0, 200] },
    { label: "recipient friends", counts: [0, 0, 0, 200] },
  ])("rejects at the $label capacity", async ({ counts }) => {
    for (const count of counts)
      db.friendConnection.count.mockResolvedValueOnce(count);
    await expect(
      sendFriendRequest(firstId, second.friendCode),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.friendConnection.create).not.toHaveBeenCalled();
  });
  it("rate limits requests using a journal independent from pending requests", async () => {
    db.accountActionAttempt.count.mockResolvedValue(20);
    await expect(
      sendFriendRequest(firstId, second.friendCode),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.friendConnection.create).not.toHaveBeenCalled();
  });
  it("retries a serialization conflict and re-evaluates all constraints", async () => {
    db.$transaction.mockRejectedValueOnce(conflict());
    await sendFriendRequest(firstId, second.friendCode);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.friendConnection.create).toHaveBeenCalledTimes(1);
  });
  it("returns a conflict after bounded retries", async () => {
    db.$transaction.mockRejectedValue(conflict());
    await expect(
      sendFriendRequest(firstId, second.friendCode),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
  it("accepts only a received request scoped to the verified account", async () => {
    db.friendConnection.findFirst.mockImplementation(({ where }) =>
      where.requesterId.not === secondId &&
      where.OR.some(
        (part: { lowId?: string; highId?: string }) => part.highId === secondId,
      )
        ? connection
        : null,
    );
    await expect(acceptFriendRequest(firstId, requestId)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      acceptFriendRequest(strangerId, requestId),
    ).rejects.toMatchObject({ status: 404 });
    await acceptFriendRequest(secondId, requestId);
    expect(db.friendConnection.update).toHaveBeenCalledTimes(1);
    expect(db.friendConnection.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "ACCEPTED" },
    });
  });
  it("checks friend capacity again when accepting", async () => {
    db.friendConnection.findFirst.mockResolvedValue(connection);
    db.friendConnection.count.mockResolvedValue(200);
    await expect(
      acceptFriendRequest(secondId, requestId),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.friendConnection.update).not.toHaveBeenCalled();
  });
  it("scopes cancellation to participants and pending status", async () => {
    await deleteFriendRequest(firstId, requestId);
    expect(db.friendConnection.deleteMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        OR: [{ lowId: firstId }, { highId: firstId }],
        status: "PENDING",
      },
    });
    expect(db.accountActionAttempt.deleteMany).not.toHaveBeenCalled();
  });
  it("removes associated room invitations when an accepted friendship ends", async () => {
    await removeFriend(firstId, secondId);
    expect(db.friendConnection.deleteMany).toHaveBeenCalledWith({
      where: { lowId: firstId, highId: secondId, status: "ACCEPTED" },
    });
    expect(db.roomInvitation.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { senderId: firstId, recipientId: secondId },
          { senderId: secondId, recipientId: firstId },
        ],
      },
    });
  });
  it("separates incoming, outgoing and accepted connections with public-only DTOs", async () => {
    db.friendConnection.findMany.mockResolvedValue([
      { ...connection, lowProfile: first, highProfile: second },
      {
        ...connection,
        id: "incoming",
        requesterId: secondId,
        lowProfile: first,
        highProfile: second,
      },
      {
        ...connection,
        id: "friend",
        status: "ACCEPTED",
        lowProfile: first,
        highProfile: second,
      },
    ]);
    expect(await listFriends(firstId)).toEqual({
      friends: [publicSecond],
      incoming: [{ id: "incoming", profile: publicSecond, createdAt: now }],
      outgoing: [{ id: requestId, profile: publicSecond, createdAt: now }],
    });
  });
});

describe("private room invitations", () => {
  it("requires accepted friendship", async () => {
    db.friendConnection.findUnique.mockResolvedValue(connection);
    await expect(
      createRoomInvitation(firstId, secondId, "ABC123"),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.roomInvitation.create).not.toHaveBeenCalled();
  });
  it("creates a ten-minute invitation without storing the room player token", async () => {
    db.friendConnection.findUnique.mockResolvedValue({
      ...connection,
      status: "ACCEPTED",
    });
    const before = Date.now();
    const invitation = await createRoomInvitation(firstId, secondId, "ABC123");
    expect(invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 600_000,
    );
    expect(db.roomInvitation.create).toHaveBeenCalledWith({
      data: {
        senderId: firstId,
        recipientId: secondId,
        roomCode: "ABC123",
        expiresAt: expect.any(Date),
      },
    });
  });
  it("deduplicates a live invitation and does not reset its expiry", async () => {
    db.friendConnection.findUnique.mockResolvedValue({
      ...connection,
      status: "ACCEPTED",
    });
    const expiresAt = new Date(Date.now() + 60_000);
    db.roomInvitation.findUnique.mockResolvedValue({
      id: requestId,
      expiresAt,
    });
    expect(await createRoomInvitation(firstId, secondId, "ABC123")).toEqual({
      id: requestId,
      roomCode: "ABC123",
      expiresAt,
    });
    expect(db.accountActionAttempt.create).not.toHaveBeenCalled();
    expect(db.roomInvitation.create).not.toHaveBeenCalled();
  });

  it("replaces an expired invitation only after checking its rate limit", async () => {
    db.friendConnection.findUnique.mockResolvedValue({
      ...connection,
      status: "ACCEPTED",
    });
    db.roomInvitation.findUnique.mockResolvedValue({
      id: requestId,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await createRoomInvitation(firstId, secondId, "ABC123");
    expect(db.accountActionAttempt.create).toHaveBeenCalledTimes(1);
    expect(db.roomInvitation.deleteMany).toHaveBeenCalledWith({
      where: { senderId: firstId, expiresAt: { lte: expect.any(Date) } },
    });
    expect(db.roomInvitation.create).toHaveBeenCalledTimes(1);
  });
  it("rate limits invitations separately from friendship requests", async () => {
    db.friendConnection.findUnique.mockResolvedValue({
      ...connection,
      status: "ACCEPTED",
    });
    db.accountActionAttempt.count.mockResolvedValue(5);
    await expect(
      createRoomInvitation(firstId, secondId, "ABC123"),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.accountActionAttempt.count).toHaveBeenCalledWith({
      where: {
        profileId: firstId,
        action: "ROOM_INVITATION",
        createdAt: { gte: expect.any(Date) },
      },
    });
  });
  it("lists only the recipient's nonexpired invitations with a public profile", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    db.roomInvitation.findMany.mockResolvedValue([
      { id: requestId, roomCode: "ABC123", expiresAt, sender: second },
    ]);
    expect(await listRoomInvitations(firstId)).toEqual([
      { id: requestId, roomCode: "ABC123", expiresAt, profile: publicSecond },
    ]);
    expect(db.roomInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: firstId, expiresAt: { gt: expect.any(Date) } },
      }),
    );
  });
  it("allows deletion only by sender or recipient", async () => {
    await deleteRoomInvitation(firstId, requestId);
    expect(db.roomInvitation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        OR: [{ senderId: firstId }, { recipientId: firstId }],
      },
    });
    db.roomInvitation.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      deleteRoomInvitation(strangerId, requestId),
    ).rejects.toMatchObject({ status: 404 });
  });
});
