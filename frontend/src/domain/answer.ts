import type { QuizData } from "../types/game";

// Keep the solo rules in sync with backend/src/domain/answer.ts.
// Multiplayer answers and scores remain exclusively validated by the server.
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
  "d",
  "un",
  "une",
  "et",
  "l",
]);

export function normalizeAnswer(value = ""): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .join("");
}

export function levenshtein(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  return rows[a.length]![b.length]!;
}

export function isCorrectAnswer(
  input: string,
  question: Pick<QuizData, "correctAnswer">,
): boolean {
  const actual = normalizeAnswer(input);
  const expected = normalizeAnswer(question.correctAnswer);
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  const similarity =
    1 -
    levenshtein(actual, expected) / Math.max(actual.length, expected.length);
  return Math.min(actual.length, expected.length) >= 4 && similarity >= 0.84;
}
