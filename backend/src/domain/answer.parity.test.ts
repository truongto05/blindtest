import { describe, expect, it } from "vitest";
import {
  isCorrectAnswer as soloAnswer,
  levenshtein as soloDistance,
  normalizeAnswer as soloNormalize,
} from "../../../frontend/src/domain/answer";
import {
  isCorrectAnswer as serverAnswer,
  levenshtein as serverDistance,
  normalizeAnswer as serverNormalize,
} from "./answer";
import type { QuizQuestion } from "./game";

// This test-only cross-import keeps the independent production builds intact.
const question = (correctAnswer: string): QuizQuestion => ({
  trackId: 1,
  audioUrl: "",
  choices: [],
  correctAnswer,
  questionType: "title",
  coverUrl: "",
});

describe("solo and multiplayer answer parity", () => {
  it("shares the normalization contract for accents, articles and punctuation", () => {
    const fixtures = [
      ["L'été d'Indila", "eteindila"],
      ["L’Impératrice", "imperatrice"],
      ["Earth, Wind & Fire", "earthwindfire"],
      ["THE Sound of Silence", "soundsilence"],
      ["AC/DC", "acdc"],
      ["M83", "m83"],
      ["the et de", ""],
    ];
    for (const [input, expected] of fixtures) {
      expect(soloNormalize(input), input).toBe(expected);
      expect(serverNormalize(input), input).toBe(expected);
    }
  });

  it("agrees on accepted and rejected answers, including the exact typo threshold", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxy";
    const fixtures: Array<[string, string, boolean]> = [
      ["bohemian rapsody", "Bohemian Rhapsody", true],
      ["Imagine", "Bohemian Rhapsody", false],
      ["Daft Punk Around World", "Daft Punk — Around the World", true],
      ["été indila", "L’Été d’Indila", true],
      ["123456x", "1234567", true],
      ["12345x", "123456", false],
      ["M8", "M83", false],
      ["M83", "M83", true],
      ["Daft Punk", "Daft Punk — One More Time", false],
      ["zzzz" + alphabet.slice(4), alphabet, true],
      ["zzzzz" + alphabet.slice(5), alphabet, false],
      ["", "Imagine", false],
      ["the", "The", false],
      ["", "", false],
    ];
    for (const [input, correctAnswer, accepted] of fixtures) {
      const context = JSON.stringify({ input, correctAnswer });
      expect(soloAnswer(input, question(correctAnswer)), context).toBe(
        accepted,
      );
      expect(serverAnswer(input, question(correctAnswer)), context).toBe(
        accepted,
      );
    }
  });

  it("stays identical across a deterministic corpus of 240 answer variations", () => {
    const titles = [
      "Bohemian Rhapsody",
      "L’été d’Indila",
      "The Sound of Silence",
      "Earth, Wind & Fire",
      "M83",
      "Daft Punk — One More Time",
      "",
      "The",
      "123456",
      "1234567",
      "AC/DC",
      "L’Impératrice",
    ];
    for (const correctAnswer of titles) {
      const variations = [
        correctAnswer.toUpperCase(),
        correctAnswer.slice(1),
        correctAnswer.slice(0, -1),
        correctAnswer + "x",
        correctAnswer.replace(/[aeiou]/i, "x"),
        "",
        "the",
        "Imagine",
        ...titles,
      ];
      for (const input of variations) {
        expect(
          soloAnswer(input, question(correctAnswer)),
          JSON.stringify({ input, correctAnswer }),
        ).toBe(serverAnswer(input, question(correctAnswer)));
      }
    }
  });

  it("keeps the same edit distance for insertions, removals and substitutions", () => {
    const fixtures: Array<[string, string, number]> = [
      ["", "pulse", 5],
      ["pulse", "", 5],
      ["pulse", "pulse", 0],
      ["puse", "pulse", 1],
      ["pulse", "puse", 1],
      ["pulse", "pulsx", 1],
      ["pulse", "pules", 2],
    ];
    for (const [input, expected, distance] of fixtures) {
      expect(soloDistance(input, expected)).toBe(distance);
      expect(serverDistance(input, expected)).toBe(distance);
    }
  });
});
