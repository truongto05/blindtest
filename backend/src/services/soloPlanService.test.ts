import { afterEach, describe, expect, it, vi } from "vitest";
import { soloPlanQuestion } from "./soloPlanService";
const question = {
  trackId: 1,
  audioUrl: "https://example.test/a.mp3",
  choices: ["A"],
  correctAnswer: "A",
  questionType: "title" as const,
  coverUrl: "",
};
afterEach(() => vi.useRealTimers());
describe("solo plan cache", () => {
  it("coalesces simultaneous prepares and isolates returned objects", async () => {
    const id = crypto.randomUUID();
    const prepare = vi.fn(async () => [question, { ...question, trackId: 2 }]);
    const [first, retry] = await Promise.all([
      soloPlanQuestion(id, "settings", 0, prepare),
      soloPlanQuestion(id, "settings", 0, prepare),
    ]);
    expect(prepare).toHaveBeenCalledOnce();
    expect(first).toEqual(retry);
    first.choices.push("changed");
    expect(retry.choices).toEqual(["A"]);
    expect((await soloPlanQuestion(id, "settings", 1, prepare)).trackId).toBe(
      2,
    );
    expect(prepare).toHaveBeenCalledOnce();
    await expect(
      soloPlanQuestion(id, "other-owner", 0, prepare),
    ).rejects.toThrow(/réglages/);
    await expect(soloPlanQuestion(id, "settings", 2, prepare)).rejects.toThrow(
      /manches/,
    );
  });
  it("does not silently start over after expiration or restart", async () => {
    vi.useFakeTimers();
    const id = crypto.randomUUID();
    const prepare = vi.fn(async () => [question, question]);
    await soloPlanQuestion(id, "settings", 0, prepare);
    vi.advanceTimersByTime(45 * 60 * 1000);
    await expect(soloPlanQuestion(id, "settings", 1, prepare)).rejects.toThrow(
      /expiré/,
    );
    expect(prepare).toHaveBeenCalledOnce();
  });
  it("allows retrying a failed initial preparation", async () => {
    const id = crypto.randomUUID();
    await expect(
      soloPlanQuestion(id, "settings", 0, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(
      await soloPlanQuestion(id, "settings", 0, async () => [question]),
    ).toEqual(question);
  });
});
