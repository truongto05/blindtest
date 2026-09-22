import { describe, expect, it } from "vitest";
import { prepareMusicPlan } from "./choiceService";
import type { MusicTrack } from "../domain/music";

const tracks: MusicTrack[] = [
  ["Dernier métro", "Les Voyageurs"],
  ["Feu de joie", "Luna"],
  ["Sous la pluie", "Orion"],
  ["Océan", "Les Hirondelles"],
].map(([title, artist], index) => ({
  id: index + 1,
  title,
  artist,
  preview: "https://cdnt-preview.dzcdn.net/test.mp3",
  cover: "",
}));
const settings = {
  rounds: 2,
  answerMode: "choices",
  answerType: "title",
} as const;

describe("frozen music plans", () => {
  it("uses the full pool for QCM even if only two unheard tracks remain", () => {
    const plan = prepareMusicPlan(tracks, settings, [1, 2]);
    expect(new Set(plan.map((q) => q.trackId))).toEqual(new Set([3, 4]));
    expect(
      plan.every(
        (q) => q.choices.length === 4 && q.choices.includes(q.correctAnswer),
      ),
    ).toBe(true);
  });
  it("counts recordings, including remasters with different ISRCs", () => {
    const editions = [
      { ...tracks[0], isrc: "FRABC2600001" },
      {
        ...tracks[0],
        id: 99,
        title: "Dernier métro (Remastered)",
        isrc: "FRABC2600002",
      },
    ];
    expect(() =>
      prepareMusicPlan(editions, { ...settings, answerMode: "input" }),
    ).toThrow(/1 morceaux/);
  });
  it("excludes editions of recent tracks too", () => {
    const plan = prepareMusicPlan(
      [
        ...tracks,
        { ...tracks[0], id: 99, title: "Dernier métro (Remastered)" },
      ],
      settings,
      [1, 2],
    );
    expect(new Set(plan.map((q) => q.trackId))).toEqual(new Set([3, 4]));
  });
  it("falls back to the available pool without repeats when everything is recent", () => {
    const plan = prepareMusicPlan(
      tracks,
      { ...settings, rounds: 4 },
      [1, 2, 3, 4],
    );
    expect(new Set(plan.map((q) => q.trackId)).size).toBe(4);
  });
  it("rejects insufficient or ambiguous selections before a first round", () => {
    expect(() => prepareMusicPlan(tracks, { ...settings, rounds: 5 })).toThrow(
      /maximum 4/,
    );
    expect(() =>
      prepareMusicPlan(
        tracks.map((track) => ({ ...track, artist: "Luna" })),
        { ...settings, answerType: "artist" },
      ),
    ).toThrow(/ambiguïté/);
  });
});
