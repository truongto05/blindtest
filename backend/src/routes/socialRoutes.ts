import { Router, type ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthError, requireAccount } from "../services/authService";
import {
  AccountError,
  acceptFriendRequest,
  createRoomInvitation,
  deleteFriendRequest,
  deleteRoomInvitation,
  getAccountProfile,
  importGuestLibrary,
  listFriends,
  listRoomInvitations,
  removeFriend,
  saveAccountProfile,
  sendFriendRequest,
} from "../services/accountService";
import {
  ownerIdSchema,
  playerTokenSchema,
  roomCodeSchema,
  usernameSchema,
} from "../validation/schemas";
import { isInvitableRoom } from "../sockets/gameHandler";

const router = Router();
const idSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const profileBody = z.object({ displayName: usernameSchema }).strict();
const importBody = z.object({ ownerId: ownerIdSchema }).strict();
const requestBody = z
  .object({
    friendCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^PULSE-[A-F0-9]{12}$/),
  })
  .strict();
const invitationBody = z
  .object({
    friendId: idSchema,
    roomCode: roomCodeSchema,
    playerToken: playerTokenSchema,
  })
  .strict();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(async (req, res, next) => {
  res.locals.accountId = (await requireAccount(req)).id;
  next();
});

router.get("/me", async (_req, res) => {
  res.json(await getAccountProfile(res.locals.accountId as string));
});
router.put("/me", async (req, res) => {
  const { displayName } = profileBody.parse(req.body);
  res.json(
    await saveAccountProfile(res.locals.accountId as string, displayName),
  );
});
router.post("/import-library", async (req, res) => {
  const { ownerId } = importBody.parse(req.body);
  res.json(await importGuestLibrary(res.locals.accountId as string, ownerId));
});
router.get("/friends", async (_req, res) => {
  res.json(await listFriends(res.locals.accountId as string));
});
router.post("/friends/requests", async (req, res) => {
  const { friendCode } = requestBody.parse(req.body);
  res
    .status(201)
    .json(await sendFriendRequest(res.locals.accountId as string, friendCode));
});
router.post("/friends/requests/:id/accept", async (req, res) => {
  await acceptFriendRequest(
    res.locals.accountId as string,
    idSchema.parse(req.params.id),
  );
  res.status(204).send();
});
router.delete("/friends/requests/:id", async (req, res) => {
  await deleteFriendRequest(
    res.locals.accountId as string,
    idSchema.parse(req.params.id),
  );
  res.status(204).send();
});
router.delete("/friends/:profileId", async (req, res) => {
  await removeFriend(
    res.locals.accountId as string,
    idSchema.parse(req.params.profileId),
  );
  res.status(204).send();
});
router.get("/invitations", async (_req, res) => {
  const invitations = await listRoomInvitations(res.locals.accountId as string);
  res.json({
    invitations: invitations.filter((item) => isInvitableRoom(item.roomCode)),
  });
});
router.post("/invitations", async (req, res) => {
  const { friendId, roomCode, playerToken } = invitationBody.parse(req.body);
  if (!isInvitableRoom(roomCode, playerToken)) {
    throw new AccountError(
      409,
      "Rejoins un salon en attente disposant de places libres pour inviter un ami.",
    );
  }
  res
    .status(201)
    .json(
      await createRoomInvitation(
        res.locals.accountId as string,
        friendId,
        roomCode,
      ),
    );
});
router.delete("/invitations/:id", async (req, res) => {
  await deleteRoomInvitation(
    res.locals.accountId as string,
    idSchema.parse(req.params.id),
  );
  res.status(204).send();
});

const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AuthError || error instanceof AccountError) {
    res.status(error.status).json({ error: error.message });
  } else if (error instanceof z.ZodError) {
    res.status(400).json({
      error: "Vérifie le pseudo, le code ami ou les informations renseignées.",
    });
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2034"].includes(error.code)
  ) {
    res.status(409).json({
      error:
        "Ces informations ont changé entre-temps. Actualise la page et réessaie.",
    });
  } else {
    res.status(503).json({
      error:
        "Les comptes et les amis sont momentanément indisponibles. Réessaie plus tard.",
    });
  }
};
router.use(errors);
export default router;
