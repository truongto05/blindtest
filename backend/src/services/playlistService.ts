import { randomBytes } from "node:crypto";
import type { PlaylistVisibility, Prisma, Track } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { resolveDeezerTrack } from "./deezerTrackService";

export type PlaylistWithTracks = Prisma.PlaylistGetPayload<{
  include: { tracks: true };
}>;
export const MAX_PLAYLIST_TRACKS = 500;

export class PlaylistError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlaylistError";
  }
}

export function isPlayableMusicTrack(
  track: Pick<Track, "deezerId" | "previewUrl">,
): boolean {
  return (
    /^\d+$/.test(track.deezerId) && track.previewUrl.startsWith("https://")
  );
}

function playlistContent(playlist: PlaylistWithTracks) {
  const tracks = [...playlist.tracks].sort(
    (a, b) =>
      a.title.localeCompare(b.title, "fr") ||
      a.deezerId.localeCompare(b.deezerId),
  );
  return {
    name: playlist.name,
    visibility: playlist.visibility,
    shareId: playlist.shareId,
    tracks,
    trackCount: tracks.length,
    playableTrackCount: tracks.filter(isPlayableMusicTrack).length,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}

export function ownerPlaylistDto(playlist: PlaylistWithTracks) {
  return { id: playlist.id, ...playlistContent(playlist) };
}

export function publicPlaylistDto(playlist: PlaylistWithTracks) {
  if (playlist.visibility === "PRIVATE" || !playlist.shareId) {
    throw new PlaylistError(
      404,
      "Cette playlist est introuvable ou n’est plus partagée.",
    );
  }
  return {
    ...playlistContent(playlist),
    visibility: playlist.visibility,
    shareId: playlist.shareId,
  };
}

export async function getOwnedPlaylist(
  id: string,
  ownerId: string,
): Promise<PlaylistWithTracks> {
  const playlist = await prisma.playlist.findFirst({
    where: { id, ownerId },
    include: { tracks: true },
  });
  if (!playlist)
    throw new PlaylistError(
      404,
      "Playlist introuvable dans cette bibliothèque.",
    );
  return playlist;
}

export async function getSharedPlaylist(
  shareId: string,
): Promise<PlaylistWithTracks> {
  const playlist = await prisma.playlist.findFirst({
    where: { shareId, visibility: { in: ["UNLISTED", "PUBLIC"] } },
    include: { tracks: true },
  });
  if (!playlist)
    throw new PlaylistError(
      404,
      "Cette playlist est introuvable ou n’est plus partagée.",
    );
  return playlist;
}

export async function listOwnedPlaylists(ownerId: string) {
  const playlists = await prisma.playlist.findMany({
    where: { ownerId },
    include: { tracks: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return playlists.map(ownerPlaylistDto);
}

export async function listPublicPlaylists(page: number, pageSize: number) {
  const where = { visibility: "PUBLIC" as const };
  const [playlists, total] = await prisma.$transaction([
    prisma.playlist.findMany({
      where,
      include: { tracks: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.playlist.count({ where }),
  ]);
  return { items: playlists.map(publicPlaylistDto), total, page, pageSize };
}

export async function createPlaylist(ownerId: string, name: string) {
  const playlist = await prisma.playlist.create({
    data: { ownerId, name },
    include: { tracks: true },
  });
  return ownerPlaylistDto(playlist);
}

export async function renamePlaylist(
  id: string,
  ownerId: string,
  name: string,
) {
  const playlist = await prisma.playlist.update({
    where: { id, ownerId },
    data: { name },
    include: { tracks: true },
  });
  return ownerPlaylistDto(playlist);
}

export async function deletePlaylist(id: string, ownerId: string) {
  const result = await prisma.playlist.deleteMany({ where: { id, ownerId } });
  if (!result.count)
    throw new PlaylistError(
      404,
      "Playlist introuvable dans cette bibliothèque.",
    );
}

export async function setPlaylistVisibility(
  id: string,
  ownerId: string,
  visibility: PlaylistVisibility,
) {
  const existing = await getOwnedPlaylist(id, ownerId);
  const shareId =
    visibility === "PRIVATE"
      ? null
      : existing.shareId || randomBytes(24).toString("base64url");
  const playlist = await prisma.playlist.update({
    where: { id, ownerId },
    data: { visibility, shareId },
    include: { tracks: true },
  });
  return ownerPlaylistDto(playlist);
}

export async function addPlaylistTrack(
  id: string,
  ownerId: string,
  track: Track,
) {
  const existing = await getOwnedPlaylist(id, ownerId);
  const alreadyAdded = existing.tracks.some(
    (item) => item.deezerId === track.deezerId,
  );
  if (!alreadyAdded && existing.tracks.length >= MAX_PLAYLIST_TRACKS) {
    throw new PlaylistError(
      409,
      "Cette playlist contient déjà 500 titres. Retire un titre avant d’en ajouter un.",
    );
  }
  const canonical = await resolveDeezerTrack(track.deezerId);
  await prisma.$transaction([
    prisma.track.upsert({
      where: { deezerId: canonical.deezerId },
      create: canonical,
      update: canonical,
    }),
    prisma.playlist.update({
      where: { id, ownerId },
      data: {
        tracks: { connect: { deezerId: canonical.deezerId } },
      },
    }),
  ]);
}

export async function removePlaylistTrack(
  id: string,
  ownerId: string,
  trackId: string,
) {
  await prisma.playlist.update({
    where: { id, ownerId },
    data: { tracks: { disconnect: { deezerId: trackId } } },
  });
}

export async function copySharedPlaylist(shareId: string, ownerId: string) {
  const original = await getSharedPlaylist(shareId);
  const playlist = await prisma.playlist.create({
    data: {
      ownerId,
      name: original.name,
      tracks: {
        connect: original.tracks.map(({ deezerId }) => ({ deezerId })),
      },
    },
    include: { tracks: true },
  });
  return ownerPlaylistDto(playlist);
}
