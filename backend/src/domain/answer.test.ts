import { describe, expect, it } from "vitest";
import { calculateScore, isCorrectAnswer, normalizeAnswer } from "./answer";
import type { QuizQuestion } from "./game";

const question = (correctAnswer: string): QuizQuestion => ({
  trackId: 1,
  audioUrl: "https://example.com/a.mp3",
  choices: [],
  correctAnswer,
  questionType: "title",
  coverUrl: "",
});
describe("answer rules", () => {
  it("normalizes accents, punctuation and common articles", () =>
    expect(normalizeAnswer("L'été d'Indila")).toBe("eteindila"));
  it("accepts a close typo but rejects unrelated answers", () => {
    expect(
      isCorrectAnswer("bohemian rapsody", question("Bohemian Rhapsody")),
    ).toBe(true);
    expect(isCorrectAnswer("Imagine", question("Bohemian Rhapsody"))).toBe(
      false,
    );
  });
  it("awards between 500 and 1000 points based on server time", () => {
    expect(calculateScore(true, 1_000, 1_000, 11_000)).toBe(1000);
    expect(calculateScore(true, 11_000, 1_000, 11_000)).toBe(500);
    expect(calculateScore(false, 1_000, 1_000, 11_000)).toBe(0);
  });
});
