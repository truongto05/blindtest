import { z } from "zod";
import { ownerIdSchema, playlistNameSchema } from "./schemas";

export const playlistIdSchema = z.string().uuid();
export const shareIdSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const trackIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_:-]+$/);
export const playlistVisibilitySchema = z.enum([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
]);

const mediaUrlSchema = z
  .string()
  .max(2_048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Adresse du média invalide.");

export const trackSchema = z
  .object({
    deezerId: trackIdSchema,
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
    coverUrl: mediaUrlSchema,
    previewUrl: mediaUrlSchema,
  })
  .strict();

export const ownerQuerySchema = z.object({ ownerId: ownerIdSchema }).strict();
export const playlistBodySchema = z
  .object({ ownerId: ownerIdSchema, name: playlistNameSchema })
  .strict();
export const visibilityBodySchema = z
  .object({ ownerId: ownerIdSchema, visibility: playlistVisibilitySchema })
  .strict();
export const addTrackBodySchema = trackSchema
  .extend({ ownerId: ownerIdSchema })
  .strict();
export const copyBodySchema = z.object({ ownerId: ownerIdSchema }).strict();
export const catalogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict();
