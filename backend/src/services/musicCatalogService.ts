import {
  getSelectionInfo,
  type CatalogSource,
} from "../catalog/officialSelections";
import type { MusicTrack } from "../domain/music";
import { fetchJson, PublicServiceError } from "./http";

const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const CACHE_CAPACITY = 64;
const MAX_IN_FLIGHT = 32;
const cache = new Map<string, { expiresAt: number; tracks: MusicTrack[] }>();
const inFlight = new Map<string, Promise<MusicTrack[]>>();

type RawObject = Record<string, unknown>;
const object = (value: unknown): RawObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawObject)
    : undefined;
const identifier = (value: unknown): string | undefined => {
  const text =
    typeof value === "number" || typeof value === "string" ? String(value) : "";
  return /^[1-9]\d{0,15}$/.test(text) && Number.isSafeInteger(Number(text))
    ? text
    : undefined;
};
const metadata = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, 200) : "";

function trustedMedia(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) return "";
  try {
    const url = new URL(value);
    const trusted = ["deezer.com", "dzcdn.net"].some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
    return url.protocol === "https:" &&
      trusted &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443")
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normalizeTrack(value: unknown): MusicTrack | undefined {
  const track = object(value);
  if (!track || track.readable === false) return;
  const id = identifier(track.id);
  const artist = object(track.artist);
  const title = metadata(track.title);
  const artistName = metadata(artist?.name);
  const preview = trustedMedia(track.preview);
  if (!id || !title || !artistName || !preview) return;
  const artistId = identifier(artist?.id);
  const isrc =
    typeof track.isrc === "string" ? track.isrc.trim().toUpperCase() : "";
  const rank = track.rank;
  const releaseDate =
    typeof track.release_date === "string" ? track.release_date : "";
  const year = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
    ? Number(releaseDate.slice(0, 4))
    : 0;
  return {
    id,
    title,
    artist: artistName,
    preview,
    cover: trustedMedia(object(track.album)?.cover_medium),
    ...(artistId ? { artistId } : {}),
    ...(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? { isrc } : {}),
    ...(typeof rank === "number" &&
    Number.isInteger(rank) &&
    rank >= 0 &&
    rank <= 1_000_000
      ? { popularity: rank }
      : {}),
    ...(year >= 1900 && year <= new Date().getUTCFullYear() + 1
      ? { year }
      : {}),
  };
}

function copyTracks(tracks: MusicTrack[]): MusicTrack[] {
  return tracks.map((track) => ({
    ...track,
    ...(track.genres ? { genres: [...track.genres] } : {}),
    ...(track.sourceIds ? { sourceIds: [...track.sourceIds] } : {}),
  }));
}

async function fetchSource(id: string): Promise<MusicTrack[]> {
  const tracks = new Map<string, MusicTrack>();
  for (let page = 0; page < MAX_PAGES; page++) {
    // Never follow an upstream `next` URL: only a fixed trusted endpoint.
    const response = object(
      await fetchJson<unknown>(
        `https://api.deezer.com/playlist/${id}/tracks?index=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`,
        4_000,
      ),
    );
    if (!response || response.error || !Array.isArray(response.data))
      throw new PublicServiceError(
        "Cette source musicale est indisponible pour le moment.",
      );
    const rows = response.data.slice(0, PAGE_SIZE);
    for (const row of rows) {
      const track = normalizeTrack(row);
      if (track) tracks.set(String(track.id), track);
    }
    const total = response.total;
    const hasMore =
      Boolean(response.next) ||
      (typeof total === "number" && total > (page + 1) * PAGE_SIZE);
    if (!rows.length || !hasMore) break;
  }
  if (!tracks.size)
    throw new PublicServiceError(
      "Cette source ne contient aucun morceau avec extrait disponible.",
    );
  return [...tracks.values()];
}

async function loadSource(id: string): Promise<MusicTrack[]> {
  const now = Date.now();
  for (const [key, entry] of cache)
    if (entry.expiresAt <= now) cache.delete(key);
  const cached = cache.get(id);
  if (cached) return copyTracks(cached.tracks);
  const pending = inFlight.get(id);
  if (pending) return copyTracks(await pending);
  if (inFlight.size >= MAX_IN_FLIGHT)
    throw new PublicServiceError(
      "Le catalogue est très sollicité. Réessaie dans un instant.",
    );
  const request = fetchSource(id).then((tracks) => {
    if (cache.size >= CACHE_CAPACITY) cache.delete(cache.keys().next().value!);
    cache.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, tracks });
    return tracks;
  });
  inFlight.set(id, request);
  try {
    return copyTracks(await request);
  } finally {
    inFlight.delete(id);
  }
}

function customId(value?: string): string {
  const input = value?.trim() || "";
  const id = identifier(input);
  if (id) return id;
  try {
    const url = new URL(input);
    const match = url.pathname.match(
      /^\/(?:[a-z]{2}\/)?playlist\/([1-9]\d{0,15})\/?$/i,
    );
    const parsed = identifier(match?.[1]);
    if (
      ["https:", "http:"].includes(url.protocol) &&
      ["deezer.com", "www.deezer.com"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      parsed
    )
      return parsed;
  } catch {
    // Only the canonical playlist ID is ever sent to Deezer.
  }
  throw new PublicServiceError(
    "Saisis un lien de playlist Deezer publique ou son identifiant numérique.",
  );
}

export async function loadMusicCatalog(
  genre: string,
  customPlaylistUrl?: string,
): Promise<MusicTrack[]> {
  const selection = getSelectionInfo(genre);
  if (genre !== "custom" && !selection)
    throw new PublicServiceError(
      "Cette sélection musicale n’existe pas. Choisis un autre thème.",
    );
  const sources: CatalogSource[] = selection?.sources || [
    {
      id: customId(customPlaylistUrl),
      label: "Playlist Deezer",
      genres: [],
      weight: 1,
    },
  ];
  const results = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      tracks: await loadSource(source.id),
    })),
  );
  const available = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const families = new Set(available.flatMap(({ source }) => source.genres));
  const minimum = genre === "all_mix" ? 3 : genre === "all" ? 2 : 1;
  if (available.length < minimum || (genre === "all_mix" && families.size < 3))
    throw new PublicServiceError(
      genre === "all_mix"
        ? "Le mix n’a pas assez de sources disponibles pour varier les styles. Réessaie plus tard ou choisis un autre thème."
        : "Cette sélection n’a pas assez de sources musicales disponibles. Réessaie plus tard ou choisis un autre thème.",
    );
  const merged = new Map<string, MusicTrack>();
  for (const { source, tracks } of available) {
    for (const track of tracks) {
      const existing = merged.get(String(track.id));
      merged.set(String(track.id), {
        ...track,
        ...existing,
        genres: [...new Set([...(existing?.genres || []), ...source.genres])],
        sourceIds: [...new Set([...(existing?.sourceIds || []), source.id])],
      });
    }
  }
  return [...merged.values()];
}
