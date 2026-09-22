import { z } from "zod";

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/);
export const playerTokenSchema = z.string().uuid();
export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N} _.-]+$/u);
export const ownerIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(80)
  .regex(/^[A-Z0-9-]+$/i);

export const settingsSchema = z
  .object({
    mode: z.enum(["classic", "progressive"]).default("classic"),
    rounds: z.coerce.number().int().min(1).max(30),
    timeLimit: z.coerce.number().int().min(5).max(60),
    genre: z.string().trim().min(1).max(40),
    answerType: z.enum(["random", "both", "artist", "title"]),
    gameType: z.enum(["music", "movie", "series", "screen"]),
    answerMode: z.enum(["choices", "input"]),
    customPlaylistUrl: z.string().trim().max(500).default(""),
    pulsePlaylistId: z.union([z.string().uuid(), z.literal("")]).default(""),
    showPoster: z.boolean().default(true),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.gameType !== "music" && settings.mode === "progressive") {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Le mode progressif est réservé à la musique.",
      });
    }
    if (
      settings.gameType === "music" &&
      settings.genre === "pulse" &&
      !settings.pulsePlaylistId
    ) {
      context.addIssue({
        code: "custom",
        path: ["pulsePlaylistId"],
        message: "Choisis une playlist de ta bibliothèque.",
      });
    }
    if (
      settings.gameType === "music" &&
      settings.genre === "custom" &&
      !/^(?:\d+|https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?playlist\/\d+(?:[/?#].*)?)$/i.test(
        settings.customPlaylistUrl,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["customPlaylistUrl"],
        message: "Playlist Deezer invalide.",
      });
    }
  });

export const joinRoomSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    roomCode: roomCodeSchema,
    username: usernameSchema,
    playerToken: playerTokenSchema,
  })
  .strict();
export const createRoomSchema = z
  .object({
    accessToken: z.string().min(1).max(8192).optional(),
    requestId: z.string().uuid().optional(),
    username: usernameSchema,
    playerToken: playerTokenSchema,
    settings: settingsSchema.optional(),
    libraryOwnerId: ownerIdSchema.optional(),
  })
  .strict();
export const answerSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerToken: playerTokenSchema,
    answer: z.string().trim().min(1).max(200),
  })
  .strict();
export const playlistNameSchema = z.string().trim().min(1).max(60);
