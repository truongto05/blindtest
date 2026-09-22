import type { Track } from "@prisma/client";
import { z } from "zod";
import { fetchJson, PublicServiceError } from "./http";

const CACHE_DURATION_MS = 5 * 60 * 1_000;
const CACHE_CAPACITY = 300;
const cache = new Map<string, { expiresAt: number; track: Track }>();

export class DeezerTrackError extends PublicServiceError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeezerTrackError";
  }
}

const trackIdSchema = z.string().regex(/^[1-9]\d{0,15}$/);
const metadataSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.slice(0, 200));
const mediaUrlSchema = z.string().refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    const trustedHost = ["deezer.com", "dzcdn.net"].some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
    return (
      url.protocol === "https:" &&
      trustedHost &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443")
    );
  } catch {
    return false;
  }
});
const canonicalTrackSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: metadataSchema,
  artist: z.object({ name: metadataSchema }),
  preview: mediaUrlSchema.optional().default(""),
  album: z
    .object({ cover_medium: mediaUrlSchema.optional().default("") })
    .optional(),
});
const errorResponseSchema = z.object({ error: z.object({ code: z.number() }) });

export async function resolveDeezerTrack(deezerId: string): Promise<Track> {
  if (!trackIdSchema.safeParse(deezerId).success) {
    throw new DeezerTrackError(
      400,
      "Choisis un titre musical Deezer valide pour l’ajouter à la playlist.",
    );
  }
  const cached = cache.get(deezerId);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.track };
  cache.delete(deezerId);

  let response: unknown;
  try {
    response = await fetchJson<unknown>(
      `https://api.deezer.com/track/${deezerId}`,
    );
  } catch {
    throw new DeezerTrackError(
      503,
      "Deezer ne répond pas pour le moment. Réessaie d’ajouter ce titre dans un instant.",
    );
  }
  const apiError = errorResponseSchema.safeParse(response);
  if (apiError.success) {
    if ([100, 800].includes(apiError.data.error.code)) {
      throw new DeezerTrackError(
        404,
        "Ce titre n’est plus disponible dans le catalogue Deezer.",
      );
    }
    throw new DeezerTrackError(
      503,
      "Le catalogue Deezer est momentanément indisponible. Réessaie dans un instant.",
    );
  }
  const parsed = canonicalTrackSchema.safeParse(response);
  if (!parsed.success || String(parsed.data.id) !== deezerId) {
    throw new DeezerTrackError(
      503,
      "Les informations de ce titre ne sont pas disponibles pour le moment. Réessaie plus tard.",
    );
  }
  const data = parsed.data;
  const track: Track = {
    deezerId,
    title: data.title,
    artist: data.artist.name,
    coverUrl: data.album?.cover_medium || "",
    previewUrl: data.preview,
  };
  for (const [id, entry] of cache) {
    if (entry.expiresAt <= Date.now()) cache.delete(id);
  }
  if (cache.size >= CACHE_CAPACITY) cache.delete(cache.keys().next().value!);
  cache.set(deezerId, { expiresAt: Date.now() + CACHE_DURATION_MS, track });
  return { ...track };
}
