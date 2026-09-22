import { randomBytes } from "node:crypto";
import { Prisma, type AccountProfile } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ownerIdSchema, usernameSchema } from "../validation/schemas";
import { AuthError, verifyAccessToken } from "./authService";
import { PublicServiceError } from "./http";

export class AccountError extends PublicServiceError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

const publicSelect = {
  id: true,
  displayName: true,
  friendCode: true,
  createdAt: true,
} as const;
type PublicProfile = Pick<AccountProfile, keyof typeof publicSelect>;
const participants = (id: string) => ({ OR: [{ lowId: id }, { highId: id }] });
const pair = (a: string, b: string) => {
  const [lowId, highId] = [a, b].sort();
  return { lowId, highId };
};
function publicProfile(profile: PublicProfile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    friendCode: profile.friendCode,
    createdAt: profile.createdAt,
  };
}
function ownProfile(profile: AccountProfile | null) {
  return profile
    ? {
        profile: publicProfile(profile),
        libraryOwnerId: profile.libraryOwnerId,
      }
    : { profile: null };
}
function isRetryable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2034", "P2002"].includes(error.code)
  );
}

// Serializable transactions make capacity checks and canonical-pair uniqueness
// effective across concurrent requests and multiple backend processes.
async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (!isRetryable(error)) throw error;
      if (attempt === 2)
        throw new AccountError(
          409,
          "Cette action a changé entre-temps. Actualise la page et réessaie.",
        );
    }
  }
  throw new AccountError(409, "Réessaie dans un instant.");
}

async function requireProfile(
  id: string,
  db: Prisma.TransactionClient = prisma,
) {
  const profile = await db.accountProfile.findUnique({ where: { id } });
  if (!profile)
    throw new AccountError(
      409,
      "Choisis un pseudo pour créer ton profil Pulse.",
    );
  return profile;
}

export async function protectLibraryOwner(
  requestedOwner: string,
  accessToken?: string,
): Promise<string> {
  const ownerId = ownerIdSchema.parse(requestedOwner);
  const linked = await prisma.accountProfile.findUnique({
    where: { libraryOwnerId: ownerId },
    select: { id: true },
  });
  if (!linked) return ownerId;
  if (!accessToken)
    throw new AuthError(401, "Connecte-toi pour accéder à cette bibliothèque.");
  const account = await verifyAccessToken(accessToken);
  if (linked.id !== account.id)
    throw new AuthError(
      403,
      "Cette bibliothèque appartient à un autre compte.",
    );
  return ownerId;
}

export async function getAccountProfile(id: string) {
  return ownProfile(await prisma.accountProfile.findUnique({ where: { id } }));
}

export async function saveAccountProfile(id: string, displayName: string) {
  const name = usernameSchema.parse(displayName);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const profile = await prisma.accountProfile.upsert({
        where: { id },
        create: {
          id,
          displayName: name,
          friendCode: `PULSE-${randomBytes(6).toString("hex").toUpperCase()}`,
          libraryOwnerId: `LIB-${randomBytes(16).toString("hex").toUpperCase()}`,
        },
        update: { displayName: name },
      });
      return ownProfile(profile);
    } catch (error) {
      if (!isRetryable(error) || attempt === 2) throw error;
    }
  }
  throw new AccountError(
    409,
    "Le profil n’a pas pu être enregistré. Réessaie.",
  );
}

export async function importGuestLibrary(id: string, requestedOwner: string) {
  const sourceOwnerId = ownerIdSchema.parse(requestedOwner);
  return serializable(async (tx) => {
    const profile = await requireProfile(id, tx);
    const linked = await tx.accountProfile.findUnique({
      where: { libraryOwnerId: sourceOwnerId },
    });
    if (linked) {
      if (linked.id === id) return { importedCount: 0, alreadyImported: true };
      throw new AccountError(
        403,
        "Seule une bibliothèque invitée peut être importée.",
      );
    }
    const previous = await tx.libraryImport.findUnique({
      where: { profileId_sourceOwnerId: { profileId: id, sourceOwnerId } },
    });
    if (previous)
      return { importedCount: previous.importedCount, alreadyImported: true };
    const originals = await tx.playlist.findMany({
      where: { ownerId: sourceOwnerId },
      include: { tracks: { select: { deezerId: true }, take: 501 } },
      orderBy: { id: "asc" },
      take: 201,
    });
    if (
      originals.length > 200 ||
      originals.some((item) => item.tracks.length > 500)
    ) {
      throw new AccountError(
        409,
        "L’import est limité à 200 playlists de 500 titres maximum.",
      );
    }
    for (const playlist of originals) {
      await tx.playlist.create({
        data: {
          name: playlist.name,
          ownerId: profile.libraryOwnerId,
          visibility: "PRIVATE",
          tracks: {
            connect: playlist.tracks.map(({ deezerId }) => ({ deezerId })),
          },
        },
      });
    }
    // An empty library is not marked as imported, so it can be imported after use.
    if (originals.length)
      await tx.libraryImport.create({
        data: { profileId: id, sourceOwnerId, importedCount: originals.length },
      });
    return { importedCount: originals.length, alreadyImported: false };
  });
}

export async function listFriends(id: string) {
  await requireProfile(id);
  const connections = await prisma.friendConnection.findMany({
    where: participants(id),
    orderBy: { createdAt: "desc" },
    include: {
      lowProfile: { select: publicSelect },
      highProfile: { select: publicSelect },
    },
  });
  const friends: PublicProfile[] = [];
  const incoming: Array<{
    id: string;
    profile: PublicProfile;
    createdAt: Date;
  }> = [];
  const outgoing: typeof incoming = [];
  for (const item of connections) {
    const profile = publicProfile(
      item.lowId === id ? item.highProfile : item.lowProfile,
    );
    if (item.status === "ACCEPTED") friends.push(profile);
    else
      (item.requesterId === id ? outgoing : incoming).push({
        id: item.id,
        profile,
        createdAt: item.createdAt,
      });
  }
  return { friends, incoming, outgoing };
}

async function countFriends(tx: Prisma.TransactionClient, id: string) {
  return tx.friendConnection.count({
    where: { ...participants(id), status: "ACCEPTED" },
  });
}

async function recordAttempt(
  tx: Prisma.TransactionClient,
  id: string,
  action: "FRIEND_REQUEST" | "ROOM_INVITATION",
  limit: number,
  durationMs: number,
) {
  const count = await tx.accountActionAttempt.count({
    where: {
      profileId: id,
      action,
      createdAt: { gte: new Date(Date.now() - durationMs) },
    },
  });
  if (count >= limit)
    throw new AccountError(
      429,
      "Tu as envoyé trop de demandes. Réessaie un peu plus tard.",
    );
  // Keep a short rolling journal; deleting a request does not reset its rate limit.
  await tx.accountActionAttempt.deleteMany({
    where: {
      profileId: id,
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) },
    },
  });
  await tx.accountActionAttempt.create({ data: { profileId: id, action } });
}

export async function sendFriendRequest(id: string, friendCode: string) {
  return serializable(async (tx) => {
    await requireProfile(id, tx);
    const target = await tx.accountProfile.findUnique({
      where: { friendCode },
      select: publicSelect,
    });
    if (!target)
      throw new AccountError(404, "Aucun profil ne correspond à ce code ami.");
    if (target.id === id)
      throw new AccountError(400, "Tu ne peux pas t’ajouter toi-même.");
    const keys = pair(id, target.id);
    const existing = await tx.friendConnection.findUnique({
      where: { lowId_highId: keys },
    });
    if (existing) {
      if (existing.status === "ACCEPTED")
        throw new AccountError(409, "Vous êtes déjà amis.");
      if (existing.requesterId !== id)
        throw new AccountError(
          409,
          "Cette personne t’a déjà envoyé une demande. Accepte-la depuis tes demandes reçues.",
        );
      return {
        request: {
          id: existing.id,
          profile: publicProfile(target),
          createdAt: existing.createdAt,
        },
      };
    }
    const outgoing = await tx.friendConnection.count({
      where: { requesterId: id, status: "PENDING" },
    });
    const incoming = await tx.friendConnection.count({
      where: {
        ...participants(target.id),
        requesterId: { not: target.id },
        status: "PENDING",
      },
    });
    if (
      outgoing >= 50 ||
      incoming >= 100 ||
      (await countFriends(tx, id)) >= 200 ||
      (await countFriends(tx, target.id)) >= 200
    ) {
      throw new AccountError(
        429,
        "La limite d’amis ou de demandes en attente est atteinte.",
      );
    }
    await recordAttempt(tx, id, "FRIEND_REQUEST", 20, 60 * 60_000);
    const connection = await tx.friendConnection.create({
      data: { ...keys, requesterId: id },
    });
    return {
      request: {
        id: connection.id,
        profile: publicProfile(target),
        createdAt: connection.createdAt,
      },
    };
  });
}

export async function acceptFriendRequest(id: string, requestId: string) {
  return serializable(async (tx) => {
    const connection = await tx.friendConnection.findFirst({
      where: { id: requestId, ...participants(id), requesterId: { not: id } },
    });
    if (!connection) throw new AccountError(404, "Demande reçue introuvable.");
    if (connection.status === "ACCEPTED") return;
    if (
      (await countFriends(tx, connection.lowId)) >= 200 ||
      (await countFriends(tx, connection.highId)) >= 200
    ) {
      throw new AccountError(429, "La limite de 200 amis est atteinte.");
    }
    await tx.friendConnection.update({
      where: { id: requestId },
      data: { status: "ACCEPTED" },
    });
  });
}

export async function deleteFriendRequest(id: string, requestId: string) {
  const result = await prisma.friendConnection.deleteMany({
    where: { id: requestId, ...participants(id), status: "PENDING" },
  });
  if (!result.count) throw new AccountError(404, "Demande introuvable.");
}

export async function removeFriend(id: string, otherId: string) {
  return serializable(async (tx) => {
    const result = await tx.friendConnection.deleteMany({
      where: { ...pair(id, otherId), status: "ACCEPTED" },
    });
    if (!result.count) throw new AccountError(404, "Ami introuvable.");
    await tx.roomInvitation.deleteMany({
      where: {
        OR: [
          { senderId: id, recipientId: otherId },
          { senderId: otherId, recipientId: id },
        ],
      },
    });
  });
}

export async function listRoomInvitations(id: string) {
  await requireProfile(id);
  const invitations = await prisma.roomInvitation.findMany({
    where: { recipientId: id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sender: { select: publicSelect } },
  });
  return invitations.map((item) => ({
    id: item.id,
    profile: publicProfile(item.sender),
    roomCode: item.roomCode,
    expiresAt: item.expiresAt,
  }));
}

export async function createRoomInvitation(
  id: string,
  friendId: string,
  roomCode: string,
) {
  return serializable(async (tx) => {
    await requireProfile(id, tx);
    const friendship = await tx.friendConnection.findUnique({
      where: { lowId_highId: pair(id, friendId) },
    });
    if (!friendship || friendship.status !== "ACCEPTED")
      throw new AccountError(403, "Tu peux inviter uniquement tes amis.");
    const keys = { senderId: id, recipientId: friendId, roomCode };
    const existing = await tx.roomInvitation.findUnique({
      where: { senderId_recipientId_roomCode: keys },
    });
    if (existing && existing.expiresAt.getTime() > Date.now())
      return { id: existing.id, roomCode, expiresAt: existing.expiresAt };
    await recordAttempt(tx, id, "ROOM_INVITATION", 5, 5 * 60_000);
    await tx.roomInvitation.deleteMany({
      where: { senderId: id, expiresAt: { lte: new Date() } },
    });
    const created = await tx.roomInvitation.create({
      data: { ...keys, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    return { id: created.id, roomCode, expiresAt: created.expiresAt };
  });
}

export async function deleteRoomInvitation(id: string, invitationId: string) {
  const result = await prisma.roomInvitation.deleteMany({
    where: { id: invitationId, OR: [{ senderId: id }, { recipientId: id }] },
  });
  if (!result.count) throw new AccountError(404, "Invitation introuvable.");
}
