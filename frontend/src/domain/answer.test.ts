import { describe, expect, it } from "vitest";
import { isCorrectAnswer, levenshtein, normalizeAnswer } from "./answer";

describe("solo answer rules, matching the multiplayer contract", () => {
  it("normalizes accents, punctuation, ampersands and common articles", () => {
    expect(normalizeAnswer("L'été d'Indila")).toBe("eteindila");
    expect(normalizeAnswer("Earth, Wind & Fire")).toBe("earthwindfire");
    expect(normalizeAnswer("THE Sound of Silence")).toBe("soundsilence");
  });

  it.each([
    ["bohemian rapsody", "Bohemian Rhapsody", true],
    ["Imagine", "Bohemian Rhapsody", false],
    ["Daft Punk Around World", "Daft Punk — Around the World", true],
    ["été indila", "L’Été d’Indila", true],
    ["123456x", "1234567", true],
    ["12345x", "123456", false],
    ["M8", "M83", false],
    ["M83", "M83", true],
    ["Daft Punk", "Daft Punk — One More Time", false],
  ] as const)(
    'evaluates "%s" against "%s" as %s',
    (input, correctAnswer, accepted) => {
      expect(isCorrectAnswer(input, { correctAnswer })).toBe(accepted);
    },
  );

  it("never awards points for empty answers or missing question answers", () => {
    expect(isCorrectAnswer("", { correctAnswer: "Imagine" })).toBe(false);
    expect(isCorrectAnswer("the", { correctAnswer: "The" })).toBe(false);
    expect(isCorrectAnswer("Imagine", {})).toBe(false);
    expect(isCorrectAnswer("", {})).toBe(false);
  });

  it("counts insertions, removals and substitutions symmetrically", () => {
    expect(levenshtein("", "pulse")).toBe(5);
    expect(levenshtein("pulse", "")).toBe(5);
    expect(levenshtein("pulse", "pulse")).toBe(0);
    expect(levenshtein("puse", "pulse")).toBe(1);
    expect(levenshtein("pulse", "puse")).toBe(1);
    expect(levenshtein("pulse", "pulsx")).toBe(1);
  });
});
