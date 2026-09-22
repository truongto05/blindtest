import type { QuizQuestion } from "./game";

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
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  return rows[a.length][b.length];
}

export function isCorrectAnswer(
  input: string,
  question: QuizQuestion,
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

export function calculateScore(
  correct: boolean,
  submittedAt: number,
  startedAt: number,
  deadline: number,
): number {
  if (!correct) return 0;
  const duration = Math.max(1, deadline - startedAt);
  const remainingRatio = Math.max(
    0,
    Math.min(1, (deadline - submittedAt) / duration),
  );
  return Math.round(500 + remainingRatio * 500);
}
