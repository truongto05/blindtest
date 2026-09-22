import { randomUUID } from "node:crypto";
import type { Track } from "@prisma/client";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistWithTracks } from "./playlistService";

const database = vi.hoisted(() => ({
  playlist: { findFirst: vi.fn() },
  accountProfile: { findUnique: vi.fn() },
}));
const auth = vi.hoisted(() => ({ verifyAccessToken: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: database }));
vi.mock("./authService", async (original) => ({
  ...(await original<typeof import("./authService")>()),
  ...auth,
}));
import { AuthError } from "./authService";
import { PlaylistError } from "./playlistService";
import {
  inspectPlaylistSource,
  nextPlaylistQuestion,
  preparePlaylistSource,
  QuizSourceError,
} from "./playlistQuizService";
import quizRoutes from "../routes/quizRoutes";

const playlistId = randomUUID();
const ownerId = "LIB-MUSIC-12345678";
const settings = {
  rounds: 4,
  answerType: "title" as const,
  answerMode: "choices" as const,
};
const track = (index: number): Track => ({
  deezerId: String(index + 1),
  title: `Titre ${index + 1}`,
  artist: `Artiste ${index + 1}`,
  coverUrl: "https://cdn.example.com/cover.jpg",
  previewUrl: `https://cdn.example.com/${index + 1}.mp3`,
});
let playlist: PlaylistWithTracks | null;
const app = express();
app.use("/api/quiz", quizRoutes);

beforeEach(() => {
  vi.resetAllMocks();
  database.accountProfile.findUnique.mockResolvedValue(null);
  auth.verifyAccessToken.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
  });
  playlist = {
    id: playlistId,
    ownerId,
    name: "Mes favoris",
    visibility: "PRIVATE",
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tracks: Array.from({ length: 4 }, (_, index) => track(index)),
  };
  database.playlist.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; ownerId: string } }) => {
      return playlist?.id === where.id && playlist.ownerId === where.ownerId
        ? structuredClone(playlist)
        : null;
    },
  );
});

describe("Pulse playlist as a music source", () => {
  it("filters nonmusical tracks, missing previews and insecure previews before checking rounds", async () => {
    playlist!.tracks.push(
      { ...track(5), deezerId: "movie:5" },
      { ...track(6), previewUrl: "" },
      { ...track(7), previewUrl: "http://cdn.example.com/7.mp3" },
    );
    const source = await inspectPlaylistSource(playlistId, ownerId, settings);
    expect(source).toMatchObject({
      name: "Mes favoris",
      trackCount: 7,
      playableCount: 4,
      issues: [],
    });
    expect(source.tracks.map((item) => item.id)).toEqual(["1", "2", "3", "4"]);
    const insufficient = await inspectPlaylistSource(playlistId, ownerId, {
      ...settings,
      rounds: 5,
    });
    expect(insufficient.issues[0]).toMatch(/au maximum 4 manches/);
  });

  it("explains empty playlists, unavailable audio and insufficient rounds", async () => {
    playlist!.tracks = [];
    await expect(
      preparePlaylistSource(playlistId, ownerId, settings),
    ).rejects.toThrow(/playlist est vide/i);
    playlist!.tracks = [{ ...track(0), previewUrl: "" }];
    await expect(
      preparePlaylistSource(playlistId, ownerId, settings),
    ).rejects.toThrow(/aucun titre musical/);
    playlist!.tracks = [track(0)];
    await expect(
      preparePlaylistSource(playlistId, ownerId, settings),
    ).rejects.toThrow(/au maximum 1 manche/);
  });

  it("checks distinct QCM answers including the artist branch of random mode", async () => {
    playlist!.tracks = playlist!.tracks.map((item, index) => ({
      ...item,
      artist: index % 2 ? "DAFT PUNK" : "Daft Punk",
    }));
    expect(
      (await inspectPlaylistSource(playlistId, ownerId, settings)).issues,
    ).toEqual([]);
    const random = await inspectPlaylistSource(playlistId, ownerId, {
      ...settings,
      answerType: "random",
    });
    expect(random.issues[0]).toMatch(/4 réponses différentes/);
    const source = await preparePlaylistSource(playlistId, ownerId, {
      ...settings,
      answerType: "artist",
      answerMode: "input",
    });
    expect(source).toHaveLength(4);
  });

  it("requires the right library and rechecks a deleted playlist before preparing a game", async () => {
    await expect(
      preparePlaylistSource(playlistId, undefined, settings),
    ).rejects.toBeInstanceOf(QuizSourceError);
    await expect(
      preparePlaylistSource(playlistId, "LIB-WRONG-12345678", settings),
    ).rejects.toBeInstanceOf(PlaylistError);
    const snapshot = await preparePlaylistSource(playlistId, ownerId, settings);
    playlist = null;
    await expect(
      preparePlaylistSource(playlistId, ownerId, settings),
    ).rejects.toMatchObject({ status: 404 });
    expect(nextPlaylistQuestion(snapshot, [], settings).choices).toHaveLength(
      4,
    );
  });

  it("never repeats a Pulse track and rejects a fully played selection", async () => {
    const source = await preparePlaylistSource(playlistId, ownerId, settings);
    const played: Array<string | number> = [];
    for (let index = 0; index < 4; index += 1) {
      const question = nextPlaylistQuestion(source, played, settings);
      expect(played).not.toContain(question.trackId);
      expect(question.choices).toContain(question.correctAnswer);
      expect(new Set(question.choices).size).toBe(4);
      played.push(question.trackId);
    }
    expect(() => nextPlaylistQuestion(source, played, settings)).toThrow(
      /Tous les extraits/,
    );
  });

  it("supports a one-track free-input game without irrelevant QCM limits", async () => {
    playlist!.tracks = [track(0)];
    const inputSettings = {
      rounds: 1,
      answerType: "both" as const,
      answerMode: "input" as const,
    };
    const source = await preparePlaylistSource(
      playlistId,
      ownerId,
      inputSettings,
    );
    expect(nextPlaylistQuestion(source, [], inputSettings)).toMatchObject({
      choices: [],
      correctAnswer: "Artiste 1 — Titre 1",
    });
  });
});

describe("Pulse quiz source HTTP endpoints", () => {
  it("requires a verified owner before inspecting or playing a linked account library", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    database.accountProfile.findUnique.mockResolvedValue({ id: accountId });
    const sourceQuery = { playlistId, ...settings };
    const nextQuery = {
      playlistId,
      genre: "pulse",
      rounds: 4,
      answerMode: "choices",
      type: "title",
    };
    for (const [path, query] of [
      ["source", sourceQuery],
      ["next", nextQuery],
    ] as const) {
      await request(app)
        .get(`/api/quiz/${path}`)
        .set("X-Library-Id", ownerId)
        .query(query)
        .expect(401);
    }
    expect(database.playlist.findFirst).not.toHaveBeenCalled();
    auth.verifyAccessToken.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
    });
    await request(app)
      .get("/api/quiz/next")
      .set("X-Library-Id", ownerId)
      .set("Authorization", "Bearer other-account-token")
      .query(nextQuery)
      .expect(403);
    expect(database.playlist.findFirst).not.toHaveBeenCalled();
    auth.verifyAccessToken.mockResolvedValue({ id: accountId });
    const response = await request(app)
      .get("/api/quiz/source")
      .set("X-Library-Id", ownerId)
      .set("Authorization", "Bearer verified-owner-token")
      .query(sourceQuery)
      .expect(200);
    expect(response.body).toMatchObject({
      name: "Mes favoris",
      playableCount: 4,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /libraryOwnerId|verified-owner-token/,
    );
  });

  it("does not expose a private quiz if the owner's access token has expired", async () => {
    database.accountProfile.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    auth.verifyAccessToken.mockRejectedValue(
      new AuthError(401, "Session expirée."),
    );
    const response = await request(app)
      .get("/api/quiz/next")
      .set("X-Library-Id", ownerId)
      .set("Authorization", "Bearer expired-token")
      .query({ playlistId, genre: "pulse", rounds: 4 })
      .expect(401);
    expect(response.body).toEqual({ error: "Session expirée." });
    expect(database.playlist.findFirst).not.toHaveBeenCalled();
  });

  it("validates using a library header and returns only launch readiness information", async () => {
    const query = { playlistId, ...settings };
    await request(app).get("/api/quiz/source").query(query).expect(400);
    const response = await request(app)
      .get("/api/quiz/source")
      .set("X-Library-Id", ownerId)
      .query(query)
      .expect(200);
    expect(response.body).toEqual({
      name: "Mes favoris",
      trackCount: 4,
      playableCount: 4,
      issues: [],
    });
    expect(response.body).not.toHaveProperty("tracks");
    expect(JSON.stringify(response.body)).not.toContain(ownerId);
    expect(response.headers["cache-control"]).toBe("no-store");
    await request(app)
      .get("/api/quiz/source")
      .set("X-Library-Id", "LIB-OTHER-12345678")
      .query(query)
      .expect(404);
  });

  it("uses the selected playlist for solo rounds, handles exhaustion and rejects query credentials", async () => {
    const query = {
      genre: "pulse",
      playlistId,
      type: "title",
      rounds: 4,
      answerMode: "choices",
    };
    await request(app).get("/api/quiz/next").query(query).expect(400);
    const response = await request(app)
      .get("/api/quiz/next")
      .set("X-Library-Id", ownerId)
      .query({ ...query, playedIds: "1,2,3" })
      .expect(200);
    expect(response.body).toMatchObject({
      trackId: "4",
      correctAnswer: "Titre 4",
    });
    await request(app)
      .get("/api/quiz/next")
      .set("X-Library-Id", ownerId)
      .query({ ...query, playedIds: "1,2,3,4" })
      .expect(400);
    await request(app)
      .get("/api/quiz/next")
      .query({ ...query, ownerId })
      .expect(400);
    playlist = null;
    await request(app)
      .get("/api/quiz/next")
      .set("X-Library-Id", ownerId)
      .query(query)
      .expect(404);
  });

  it("reports database unavailability without exposing connection details", async () => {
    database.playlist.findFirst.mockRejectedValueOnce(
      new Error("postgres password secret"),
    );
    const response = await request(app)
      .get("/api/quiz/source")
      .set("X-Library-Id", ownerId)
      .query({ playlistId, ...settings })
      .expect(503);
    expect(response.body.error).toMatch(/bibliothèque ne répond pas/i);
    expect(response.body.error).not.toContain("password");
  });
});
