import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireAccount: vi.fn() }));
const account = vi.hoisted(() => ({
  getAccountProfile: vi.fn(),
  saveAccountProfile: vi.fn(),
  importGuestLibrary: vi.fn(),
  listFriends: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  deleteFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  listRoomInvitations: vi.fn(),
  createRoomInvitation: vi.fn(),
  deleteRoomInvitation: vi.fn(),
}));
const rooms = vi.hoisted(() => ({ isInvitableRoom: vi.fn() }));
vi.mock("../services/authService", async (original) => ({
  ...(await original<typeof import("../services/authService")>()),
  ...auth,
}));
vi.mock("../services/accountService", async (original) => ({
  ...(await original<typeof import("../services/accountService")>()),
  ...account,
}));
vi.mock("../sockets/gameHandler", () => rooms);
import socialRoutes from "./socialRoutes";
import { AuthError } from "../services/authService";
import { AccountError } from "../services/accountService";

const id = "11111111-1111-4111-8111-111111111111";
const friendId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const playerToken = "44444444-4444-4444-8444-444444444444";
const app = express();
app.use(express.json());
app.use("/api/account", socialRoutes);

beforeEach(() => {
  vi.resetAllMocks();
  auth.requireAccount.mockResolvedValue({ id });
  account.getAccountProfile.mockResolvedValue({ profile: null });
  account.listFriends.mockResolvedValue({
    friends: [],
    incoming: [],
    outgoing: [],
  });
  account.listRoomInvitations.mockResolvedValue([]);
  rooms.isInvitableRoom.mockReturnValue(true);
});

describe("account and social HTTP boundaries", () => {
  it.each([401, 403, 503])(
    "returns Auth %i with no service access or secret details",
    async (status) => {
      auth.requireAccount.mockRejectedValue(
        new AuthError(status, "Compte indisponible."),
      );
      const response = await request(app).get("/api/account/me").expect(status);
      expect(response.body).toEqual({ error: "Compte indisponible." });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(account.getAccountProfile).not.toHaveBeenCalled();
    },
  );
  it("keeps null profile distinct from an unauthenticated session", async () => {
    expect(
      (await request(app).get("/api/account/me").expect(200)).body,
    ).toEqual({ profile: null });
    expect(account.getAccountProfile).toHaveBeenCalledWith(id);
  });
  it("derives profile identity only from the verified token, never a body ID or library key", async () => {
    await request(app)
      .put("/api/account/me")
      .send({ displayName: "Nina", id: friendId })
      .expect(400);
    await request(app)
      .put("/api/account/me")
      .send({ displayName: "Nina", libraryOwnerId: "LIB-SPOOF-123456" })
      .expect(400);
    account.saveAccountProfile.mockResolvedValue({
      profile: { id, displayName: "Nina" },
      libraryOwnerId: "LIB-PRIVATE-123456",
    });
    await request(app)
      .put("/api/account/me")
      .send({ displayName: "  Nina  " })
      .expect(200);
    expect(account.saveAccountProfile).toHaveBeenCalledExactlyOnceWith(
      id,
      "Nina",
    );
  });
  it("imports only an explicitly provided guest capability for the current account", async () => {
    account.importGuestLibrary.mockResolvedValue({
      importedCount: 2,
      alreadyImported: false,
    });
    const response = await request(app)
      .post("/api/account/import-library")
      .send({ ownerId: "LIB-GUEST-12345678" })
      .expect(200);
    expect(account.importGuestLibrary).toHaveBeenCalledWith(
      id,
      "LIB-GUEST-12345678",
    );
    expect(response.body).toEqual({ importedCount: 2, alreadyImported: false });
    await request(app)
      .post("/api/account/import-library")
      .send({ ownerId: "LIB-GUEST-12345678", accountId: friendId })
      .expect(400);
  });
  it("accepts an exact public friend code, normalizes it, and offers no email lookup", async () => {
    account.sendFriendRequest.mockResolvedValue({ request: { id: itemId } });
    await request(app)
      .post("/api/account/friends/requests")
      .send({ friendCode: " pulse-abcdef123456 " })
      .expect(201);
    expect(account.sendFriendRequest).toHaveBeenCalledWith(
      id,
      "PULSE-ABCDEF123456",
    );
    await request(app)
      .post("/api/account/friends/requests")
      .send({ email: "private@example.com" })
      .expect(400);
    await request(app)
      .post("/api/account/friends/requests")
      .send({ friendCode: "private@example.com" })
      .expect(400);
  });
  it.each([403, 404, 409, 429])(
    "preserves a safe social service status %i",
    async (status) => {
      account.sendFriendRequest.mockRejectedValue(
        new AccountError(status, "Demande impossible."),
      );
      const response = await request(app)
        .post("/api/account/friends/requests")
        .send({ friendCode: "PULSE-ABCDEF123456" })
        .expect(status);
      expect(response.body).toEqual({ error: "Demande impossible." });
    },
  );
  it("handles received/declined/cancelled/removed endpoints using the verified account ID", async () => {
    await request(app).get("/api/account/friends").expect(200);
    await request(app)
      .post(`/api/account/friends/requests/${itemId}/accept`)
      .expect(204);
    await request(app)
      .delete(`/api/account/friends/requests/${itemId}`)
      .expect(204);
    await request(app).delete(`/api/account/friends/${friendId}`).expect(204);
    expect(account.listFriends).toHaveBeenCalledWith(id);
    expect(account.acceptFriendRequest).toHaveBeenCalledWith(id, itemId);
    expect(account.deleteFriendRequest).toHaveBeenCalledWith(id, itemId);
    expect(account.removeFriend).toHaveBeenCalledWith(id, friendId);
    await request(app)
      .post("/api/account/friends/requests/not-a-uuid/accept")
      .expect(400);
  });
  it("does not expose raw database failure details", async () => {
    account.getAccountProfile.mockRejectedValue(
      new Error("postgres://secret:password@db"),
    );
    const response = await request(app).get("/api/account/me").expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(
      /postgres|secret|password/,
    );
  });
});

describe("invitation HTTP boundaries", () => {
  it("checks the caller's confidential player proof before persisting an invitation", async () => {
    account.createRoomInvitation.mockResolvedValue({
      id: itemId,
      roomCode: "ABC123",
      expiresAt: "2026-09-15T12:10:00Z",
    });
    const response = await request(app)
      .post("/api/account/invitations")
      .send({ friendId, roomCode: "abc123", playerToken })
      .expect(201);
    expect(rooms.isInvitableRoom).toHaveBeenCalledWith("ABC123", playerToken);
    expect(account.createRoomInvitation).toHaveBeenCalledWith(
      id,
      friendId,
      "ABC123",
    );
    expect(JSON.stringify(response.body)).not.toContain(playerToken);
  });
  it("refuses a missing/invalid player proof and a closed/full/non-member room", async () => {
    await request(app)
      .post("/api/account/invitations")
      .send({ friendId, roomCode: "ABC123" })
      .expect(400);
    rooms.isInvitableRoom.mockReturnValue(false);
    await request(app)
      .post("/api/account/invitations")
      .send({ friendId, roomCode: "ABC123", playerToken })
      .expect(409);
    expect(account.createRoomInvitation).not.toHaveBeenCalled();
  });
  it("hides invitations to rooms that are no longer joinable", async () => {
    const invitation = {
      id: itemId,
      profile: { id: friendId, displayName: "Alex" },
      roomCode: "ABC123",
      expiresAt: "2026-09-15T12:10:00Z",
    };
    account.listRoomInvitations.mockResolvedValue([
      invitation,
      { ...invitation, roomCode: "DEF456" },
    ]);
    rooms.isInvitableRoom.mockImplementation(
      (code: string) => code === "ABC123",
    );
    expect(
      (await request(app).get("/api/account/invitations").expect(200)).body,
    ).toEqual({ invitations: [invitation] });
  });
  it("uses the authenticated identity to dismiss an invitation", async () => {
    await request(app).delete(`/api/account/invitations/${itemId}`).expect(204);
    expect(account.deleteRoomInvitation).toHaveBeenCalledWith(id, itemId);
  });
});
