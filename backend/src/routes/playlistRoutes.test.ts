import { randomUUID } from "node:crypto";
import { Prisma, type PlaylistVisibility, type Track } from "@prisma/client";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistWithTracks } from "../services/playlistService";

const database = vi.hoisted(() => ({
  accountProfile: { findUnique: vi.fn() },
  playlist: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  track: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
const canonicalService = vi.hoisted(() => ({ resolveDeezerTrack: vi.fn() }));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: database }));
vi.mock("../services/authService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/authService")>()),
  ...auth,
}));
vi.mock("../services/deezerTrackService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/deezerTrackService")>();
  return { ...actual, ...canonicalService };
});
import playlistRoutes from "./playlistRoutes";
import { DeezerTrackError } from "../services/deezerTrackService";

type Filter = {
  id?: string;
  ownerId?: string;
  shareId?: string;
  visibility?: PlaylistVisibility | { in: PlaylistVisibility[] };
};
type FindArgs = { where: Filter; skip?: number; take?: number };
type CreateArgs = {
  data: {
    ownerId: string;
    name: string;
    tracks?: { connect: Array<{ deezerId: string }> };
  };
};
type UpdateArgs = {
  where: Filter;
  data: {
    name?: string;
    visibility?: PlaylistVisibility;
    shareId?: string | null;
    tracks?: {
      connect?: { deezerId: string };
      connectOrCreate?: { where: { deezerId: string }; create: Track };
      disconnect?: { deezerId: string };
    };
  };
};

const ownerId = "LIB-ORIGINAL-12345678";
const visitorId = "LIB-VISITOR-12345678";
const track: Track = {
  deezerId: "123456",
  title: "One More Time",
  artist: "Daft Punk",
  coverUrl: "https://cdn.example.com/cover.jpg",
  previewUrl: "https://cdn.example.com/preview.mp3",
};
const records = new Map<string, PlaylistWithTracks>();
const tracks = new Map<string, Track>();
const app = express();
app.use(express.json());
app.use("/api/playlists", playlistRoutes);

function matches(playlist: PlaylistWithTracks, filter: Filter): boolean {
  return (
    (!filter.id || playlist.id === filter.id) &&
    (!filter.ownerId || playlist.ownerId === filter.ownerId) &&
    (!filter.shareId || playlist.shareId === filter.shareId) &&
    (!filter.visibility ||
      (typeof filter.visibility === "string"
        ? playlist.visibility === filter.visibility
        : filter.visibility.in.includes(playlist.visibility)))
  );
}

function missingRecord(): never {
  throw new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "6.19.3",
  });
}

async function create(name = "Découvertes", libraryId = ownerId) {
  const response = await request(app)
    .post("/api/playlists")
    .send({ ownerId: libraryId, name })
    .expect(201);
  return response.body as {
    id: string;
    name: string;
    visibility: PlaylistVisibility;
    shareId: string | null;
    tracks: Track[];
  };
}

async function publish(
  id: string,
  visibility: PlaylistVisibility = "UNLISTED",
) {
  const response = await request(app)
    .patch(`/api/playlists/${id}/visibility`)
    .send({ ownerId, visibility })
    .expect(200);
  return response.body as { shareId: string; visibility: PlaylistVisibility };
}

beforeEach(() => {
  vi.resetAllMocks();
  database.accountProfile.findUnique.mockResolvedValue(null);
  auth.verifyAccessToken.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
  });
  records.clear();
  tracks.clear();
  canonicalService.resolveDeezerTrack.mockImplementation(
    async (deezerId: string) => ({
      ...track,
      deezerId,
      previewUrl: deezerId === "444" ? "" : track.previewUrl,
    }),
  );
  database.playlist.findFirst.mockImplementation(
    async ({ where }: FindArgs) => {
      const found = [...records.values()].find((item) => matches(item, where));
      return found ? structuredClone(found) : null;
    },
  );
  database.playlist.findMany.mockImplementation(
    async ({ where, skip = 0, take }: FindArgs) => {
      const found = [...records.values()]
        .filter((item) => matches(item, where))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        );
      return structuredClone(
        found.slice(skip, take === undefined ? undefined : skip + take),
      );
    },
  );
  database.playlist.count.mockImplementation(
    async ({ where }: FindArgs) =>
      [...records.values()].filter((item) => matches(item, where)).length,
  );
  database.playlist.create.mockImplementation(async ({ data }: CreateArgs) => {
    const playlist: PlaylistWithTracks = {
      id: randomUUID(),
      ownerId: data.ownerId,
      name: data.name,
      visibility: "PRIVATE",
      shareId: null,
      createdAt: new Date(Date.UTC(2026, 8, 9, 12, 0, records.size)),
      updatedAt: new Date(),
      tracks: (data.tracks?.connect || []).map(({ deezerId }) => ({
        ...tracks.get(deezerId)!,
      })),
    };
    records.set(playlist.id, playlist);
    return structuredClone(playlist);
  });
  database.playlist.update.mockImplementation(
    async ({ where, data }: UpdateArgs) => {
      const playlist = [...records.values()].find((item) =>
        matches(item, where),
      );
      if (!playlist) return missingRecord();
      if (data.name !== undefined) playlist.name = data.name;
      if (data.visibility !== undefined) playlist.visibility = data.visibility;
      if (data.shareId !== undefined) playlist.shareId = data.shareId;
      const addition = data.tracks?.connectOrCreate;
      if (addition) {
        if (!tracks.has(addition.where.deezerId))
          tracks.set(addition.where.deezerId, { ...addition.create });
        if (
          !playlist.tracks.some(
            (item) => item.deezerId === addition.where.deezerId,
          )
        ) {
          playlist.tracks.push({ ...tracks.get(addition.where.deezerId)! });
        }
      }
      const connection = data.tracks?.connect;
      if (
        connection &&
        !playlist.tracks.some((item) => item.deezerId === connection.deezerId)
      ) {
        playlist.tracks.push({ ...tracks.get(connection.deezerId)! });
      }
      if (data.tracks?.disconnect)
        playlist.tracks = playlist.tracks.filter(
          (item) => item.deezerId !== data.tracks?.disconnect?.deezerId,
        );
      playlist.updatedAt = new Date();
      return structuredClone(playlist);
    },
  );
  database.playlist.deleteMany.mockImplementation(
    async ({ where }: FindArgs) => {
      const found = [...records.values()].filter((item) =>
        matches(item, where),
      );
      found.forEach((item) => records.delete(item.id));
      return { count: found.length };
    },
  );
  database.track.upsert.mockImplementation(
    async ({
      where,
      create,
      update,
    }: {
      where: { deezerId: string };
      create: Track;
      update: Track;
    }) => {
      const canonical = { ...(tracks.has(where.deezerId) ? update : create) };
      tracks.set(where.deezerId, canonical);
      for (const playlist of records.values()) {
        playlist.tracks = playlist.tracks.map((item) =>
          item.deezerId === where.deezerId ? { ...canonical } : item,
        );
      }
      return { ...canonical };
    },
  );
  database.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
    Promise.all(queries),
  );
});

describe("playlist owner API", () => {
  it("accepts a private header without putting library credentials in URLs", async () => {
    const playlist = await create();
    const list = await request(app)
      .get("/api/playlists")
      .set("X-Library-Id", ownerId)
      .expect(200);
    expect(list.body).toHaveLength(1);
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .expect(200);
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", visitorId)
      .expect(404);
    await request(app)
      .get("/api/playlists")
      .set("X-Library-Id", "bad")
      .expect(400);
    await request(app)
      .delete(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", visitorId)
      .expect(404);
    await request(app)
      .delete(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .expect(204);
  });
  it("creates private playlists and only lists the current library without its secret", async () => {
    const playlist = await create("  Soirée  ");
    await create("Autre bibliothèque", visitorId);
    expect(playlist).toMatchObject({
      name: "Soirée",
      visibility: "PRIVATE",
      shareId: null,
      tracks: [],
      trackCount: 0,
      playableTrackCount: 0,
    });
    expect(playlist).not.toHaveProperty("ownerId");
    const response = await request(app)
      .get("/api/playlists")
      .query({ ownerId })
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(playlist.id);
    expect(response.headers["cache-control"]).toBe("no-store");
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .query({ ownerId })
      .expect(200);
  });

  it("renames and deletes a playlist owned by this library", async () => {
    const playlist = await create();
    const renamed = await request(app)
      .patch(`/api/playlists/${playlist.id}`)
      .send({ ownerId, name: "Nouveau nom" })
      .expect(200);
    expect(renamed.body.name).toBe("Nouveau nom");
    await request(app)
      .delete(`/api/playlists/${playlist.id}`)
      .query({ ownerId })
      .expect(204);
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .query({ ownerId })
      .expect(404);
  });

  it("rejects every read or mutation when the library code is wrong", async () => {
    const playlist = await create();
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .query({ ownerId: visitorId })
      .expect(404);
    await request(app)
      .patch(`/api/playlists/${playlist.id}`)
      .send({ ownerId: visitorId, name: "Intrusion" })
      .expect(404);
    await request(app)
      .patch(`/api/playlists/${playlist.id}/visibility`)
      .send({ ownerId: visitorId, visibility: "PUBLIC" })
      .expect(404);
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId: visitorId, ...track })
      .expect(404);
    await request(app)
      .delete(`/api/playlists/${playlist.id}/tracks/${track.deezerId}`)
      .query({ ownerId: visitorId })
      .expect(404);
    await request(app)
      .delete(`/api/playlists/${playlist.id}`)
      .query({ ownerId: visitorId })
      .expect(404);
    expect(records.get(playlist.id)).toMatchObject({
      name: "Découvertes",
      visibility: "PRIVATE",
      tracks: [],
    });
    expect(canonicalService.resolveDeezerTrack).not.toHaveBeenCalled();
  });

  it("adds a track once, counts playable music and removes only the playlist relation", async () => {
    const playlist = await create();
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(201);
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(201);
    records.get(playlist.id)!.tracks.push({ ...track, deezerId: "movie:123" });
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track, deezerId: "444", previewUrl: "" })
      .expect(201);
    const response = await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .query({ ownerId })
      .expect(200);
    expect(response.body).toMatchObject({
      trackCount: 3,
      playableTrackCount: 1,
    });
    await request(app)
      .delete(`/api/playlists/${playlist.id}/tracks/${track.deezerId}`)
      .query({ ownerId })
      .expect(204);
    expect(records.get(playlist.id)?.tracks).toHaveLength(2);
    expect(tracks.has(track.deezerId)).toBe(true);
  });

  it("validates IDs, library codes, visibility, extra fields and safe media URLs", async () => {
    const playlist = await create();
    await request(app)
      .post("/api/playlists")
      .send({ ownerId, name: "  " })
      .expect(400);
    await request(app)
      .post("/api/playlists")
      .send({ ownerId, name: "Essai", visibility: "PUBLIC" })
      .expect(400);
    await request(app)
      .get("/api/playlists")
      .query({ ownerId: "bad" })
      .expect(400);
    await request(app)
      .get("/api/playlists/not-a-uuid")
      .query({ ownerId })
      .expect(400);
    await request(app)
      .patch(`/api/playlists/${playlist.id}/visibility`)
      .send({ ownerId, visibility: "everyone" })
      .expect(400);
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track, previewUrl: "javascript:alert(1)" })
      .expect(400);
    await request(app).get("/api/playlists/share/too-short").expect(400);
    await request(app)
      .get("/api/playlists/public")
      .query({ page: -1 })
      .expect(400);
    await request(app)
      .get("/api/playlists/public")
      .query({ limit: 25 })
      .expect(400);
    expect(records.get(playlist.id)?.tracks).toHaveLength(0);
  });

  it("ignores forged artist, title and media URLs and stores only canonical Deezer metadata", async () => {
    const original = await create();
    const copy = await create("Autre bibliothèque", visitorId);
    const forged = {
      ...track,
      artist: "Faux artiste",
      title: "Faux titre",
      coverUrl: "https://attacker.example/tracker.jpg",
      previewUrl: "https://attacker.example/arbitrary.mp3",
    };
    await request(app)
      .post(`/api/playlists/${original.id}/tracks`)
      .send({ ownerId, ...forged })
      .expect(201);
    await request(app)
      .post(`/api/playlists/${copy.id}/tracks`)
      .send({ ownerId: visitorId, ...forged })
      .expect(201);
    expect(canonicalService.resolveDeezerTrack).toHaveBeenCalledWith(
      track.deezerId,
    );
    for (const [id, libraryId] of [
      [original.id, ownerId],
      [copy.id, visitorId],
    ]) {
      const response = await request(app)
        .get(`/api/playlists/${id}`)
        .query({ ownerId: libraryId })
        .expect(200);
      expect(response.body.tracks).toEqual([track]);
      expect(JSON.stringify(response.body)).not.toContain("attacker.example");
    }
  });

  it("repairs previously untrusted global metadata even when the track is already in the playlist", async () => {
    const playlist = await create();
    const untrusted = {
      ...track,
      artist: "Ancien faux artiste",
      previewUrl: "https://attacker.example/audio.mp3",
    };
    tracks.set(track.deezerId, untrusted);
    records.get(playlist.id)!.tracks.push(untrusted);
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...untrusted })
      .expect(201);
    const response = await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .query({ ownerId })
      .expect(200);
    expect(response.body.tracks).toEqual([track]);
    expect(canonicalService.resolveDeezerTrack).toHaveBeenCalledOnce();
  });
});

describe("shared and public playlists", () => {
  it("shares an unpredictable link without exposing the owner code or internal ID", async () => {
    const playlist = await create();
    await request(app)
      .get(`/api/playlists/share/${"x".repeat(32)}`)
      .expect(404);
    const shared = await publish(playlist.id);
    expect(shared.shareId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(shared.shareId).not.toBe(playlist.id);
    const response = await request(app)
      .get(`/api/playlists/share/${shared.shareId}`)
      .expect(200);
    expect(response.body).toMatchObject({
      name: playlist.name,
      visibility: "UNLISTED",
      shareId: shared.shareId,
    });
    expect(response.body).not.toHaveProperty("ownerId");
    expect(response.body).not.toHaveProperty("id");
    expect(JSON.stringify(response.body)).not.toContain(ownerId);
    const catalog = await request(app).get("/api/playlists/public").expect(200);
    expect(catalog.body).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
    });
  });

  it("revokes a link when private and gives a different link on subsequent sharing", async () => {
    const playlist = await create();
    const first = await publish(playlist.id);
    const privatePlaylist = await publish(playlist.id, "PRIVATE");
    expect(privatePlaylist.shareId).toBeNull();
    await request(app).get(`/api/playlists/share/${first.shareId}`).expect(404);
    await request(app)
      .post(`/api/playlists/share/${first.shareId}/copy`)
      .send({ ownerId: visitorId })
      .expect(404);
    const second = await publish(playlist.id, "PUBLIC");
    expect(second.shareId).not.toBe(first.shareId);
    const unlisted = await publish(playlist.id, "UNLISTED");
    expect(unlisted.shareId).toBe(second.shareId);
    await request(app).get(`/api/playlists/share/${first.shareId}`).expect(404);
  });

  it("paginates only public playlists without leaking private identities", async () => {
    await create("Privée");
    const unlisted = await create("Non répertoriée");
    await publish(unlisted.id);
    const first = await create("Publique 1");
    const second = await create("Publique 2");
    const third = await create("Publique 3");
    for (const playlist of [first, second, third])
      await publish(playlist.id, "PUBLIC");
    const response = await request(app)
      .get("/api/playlists/public")
      .query({ page: 2, limit: 2 })
      .expect(200);
    expect(response.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe("Publique 1");
    expect(response.body.items[0]).not.toHaveProperty("ownerId");
    expect(response.body.items[0]).not.toHaveProperty("id");
  });

  it("duplicates as an independent private playlist and preserves original track metadata", async () => {
    const original = await create();
    await request(app)
      .post(`/api/playlists/${original.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(201);
    const shared = await publish(original.id);
    const response = await request(app)
      .post(`/api/playlists/share/${shared.shareId}/copy`)
      .send({ ownerId: visitorId })
      .expect(201);
    const copy = response.body as { id: string; tracks: Track[] };
    expect(copy.id).not.toBe(original.id);
    expect(response.body).toMatchObject({
      name: original.name,
      visibility: "PRIVATE",
      shareId: null,
      tracks: [track],
    });
    await request(app)
      .patch(`/api/playlists/${copy.id}`)
      .send({ ownerId: visitorId, name: "Ma copie" })
      .expect(200);
    await request(app)
      .delete(`/api/playlists/${copy.id}/tracks/${track.deezerId}`)
      .query({ ownerId: visitorId })
      .expect(204);
    await request(app)
      .post(`/api/playlists/${copy.id}/tracks`)
      .send({ ownerId: visitorId, ...track, title: "Métadonnées modifiées" })
      .expect(201);
    const unchanged = await request(app)
      .get(`/api/playlists/share/${shared.shareId}`)
      .expect(200);
    expect(unchanged.body).toMatchObject({
      name: original.name,
      tracks: [track],
    });
    expect(tracks.get(track.deezerId)?.title).toBe(track.title);
    await request(app)
      .delete(`/api/playlists/${original.id}`)
      .query({ ownerId })
      .expect(204);
    const retained = await request(app)
      .get(`/api/playlists/${copy.id}`)
      .query({ ownerId: visitorId })
      .expect(200);
    expect(retained.body).toMatchObject({ name: "Ma copie", tracks: [track] });
  });
});

describe("playlist failures", () => {
  it("does not persist caller metadata when canonical resolution fails or rejects a nonmusical ID", async () => {
    const playlist = await create();
    canonicalService.resolveDeezerTrack.mockRejectedValueOnce(
      new DeezerTrackError(
        503,
        "Deezer ne répond pas pour le moment. Réessaie dans un instant.",
      ),
    );
    const unavailable = await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(503);
    expect(unavailable.body.error).toMatch(/Deezer/);
    canonicalService.resolveDeezerTrack.mockRejectedValueOnce(
      new DeezerTrackError(
        400,
        "Seuls les titres musicaux Deezer peuvent être enregistrés.",
      ),
    );
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track, deezerId: "movie:123" })
      .expect(400);
    expect(database.track.upsert).not.toHaveBeenCalled();
    expect(records.get(playlist.id)?.tracks).toEqual([]);
  });

  it("returns a human 503 instead of database details for reads and writes", async () => {
    const playlist = await create();
    const failure = new Error(
      "postgres://secret:password@private-host unavailable",
    );
    database.playlist.findMany.mockRejectedValueOnce(failure);
    const read = await request(app)
      .get("/api/playlists")
      .query({ ownerId })
      .expect(503);
    expect(read.body.error).toMatch(/temporairement indisponible/i);
    expect(JSON.stringify(read.body)).not.toContain("password");
    database.playlist.update.mockRejectedValueOnce(failure);
    await request(app)
      .patch(`/api/playlists/${playlist.id}`)
      .send({ ownerId, name: "Test" })
      .expect(503);
  });

  it("returns a conflict when a playlist has reached its track limit", async () => {
    const playlist = await create();
    records.get(playlist.id)!.tracks = Array.from(
      { length: 500 },
      (_, index) => ({ ...track, deezerId: String(index) }),
    );
    const response = await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(409);
    expect(response.body.error).toMatch(/500 titres/);
  });

  it("requires authentication on every private account-library operation, including copies", async () => {
    const playlist = await create();
    const { shareId } = await publish(playlist.id);
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    await request(app)
      .get("/api/playlists")
      .set("X-Library-Id", ownerId)
      .expect(401);
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .expect(401);
    await request(app)
      .post("/api/playlists")
      .send({ ownerId, name: "Protégée" })
      .expect(401);
    await request(app)
      .patch(`/api/playlists/${playlist.id}`)
      .send({ ownerId, name: "Tentative" })
      .expect(401);
    await request(app)
      .delete(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .expect(401);
    await request(app)
      .patch(`/api/playlists/${playlist.id}/visibility`)
      .send({ ownerId, visibility: "PUBLIC" })
      .expect(401);
    await request(app)
      .post(`/api/playlists/${playlist.id}/tracks`)
      .send({ ownerId, ...track })
      .expect(401);
    await request(app)
      .delete(`/api/playlists/${playlist.id}/tracks/${track.deezerId}`)
      .set("X-Library-Id", ownerId)
      .expect(401);
    await request(app)
      .post(`/api/playlists/share/${shareId}/copy`)
      .send({ ownerId })
      .expect(401);
    expect(records.size).toBe(1);
    expect(records.get(playlist.id)?.name).toBe("Découvertes");
    expect(canonicalService.resolveDeezerTrack).not.toHaveBeenCalled();
    // Public discovery/sharing do not acquire a private-account requirement.
    await request(app).get("/api/playlists/public").expect(200);
    await request(app).get(`/api/playlists/share/${shareId}`).expect(200);
  });

  it("rejects another authenticated account and accepts the library's verified owner", async () => {
    const playlist = await create();
    database.accountProfile.findUnique.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
    });
    await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .set("Authorization", "Bearer first-account-token")
      .expect(403);
    auth.verifyAccessToken.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
    });
    const response = await request(app)
      .get(`/api/playlists/${playlist.id}`)
      .set("X-Library-Id", ownerId)
      .set("Authorization", "Bearer second-account-token")
      .expect(200);
    expect(auth.verifyAccessToken).toHaveBeenLastCalledWith(
      "second-account-token",
    );
    expect(response.body).not.toHaveProperty("ownerId");
  });

  it("does not treat account lookup failure as anonymous library access", async () => {
    database.accountProfile.findUnique.mockRejectedValue(
      new Error("private database credentials"),
    );
    const response = await request(app)
      .post("/api/playlists")
      .send({ ownerId, name: "Tentative" })
      .expect(503);
    expect(database.playlist.create).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain("credentials");
  });
});
