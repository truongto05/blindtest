import { describe, expect, it } from "vitest";
import { joinRoomSchema, settingsSchema } from "./schemas";
describe("socket payload validation", () => {
  it("rejects malformed room codes and unknown keys", () =>
    expect(
      joinRoomSchema.safeParse({
        roomCode: "oops",
        username: "Nina",
        playerToken: crypto.randomUUID(),
        admin: true,
      }).success,
    ).toBe(false));
  it("bounds timers and rounds", () =>
    expect(
      settingsSchema.safeParse({
        mode: "classic",
        rounds: 99,
        timeLimit: 1,
        genre: "all",
        answerType: "title",
        gameType: "music",
        answerMode: "choices",
        customPlaylistUrl: "",
        showPoster: true,
      }).success,
    ).toBe(false));
});
