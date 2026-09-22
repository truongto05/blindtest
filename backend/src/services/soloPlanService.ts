import type { QuizQuestion } from "../domain/game";
import { PublicServiceError } from "./http";

const TTL = 45 * 60 * 1000;
const CAPACITY = 200;
type Entry = {
  fingerprint: string;
  expiresAt: number;
  questions: Promise<QuizQuestion[]>;
};
const plans = new Map<string, Entry>();

export async function soloPlanQuestion(
  id: string,
  fingerprint: string,
  roundIndex: number,
  prepare: () => Promise<QuizQuestion[]>,
): Promise<QuizQuestion> {
  const now = Date.now();
  for (const [key, entry] of plans)
    if (entry.expiresAt <= now) plans.delete(key);
  let entry = plans.get(id);
  if (!entry) {
    if (roundIndex !== 0)
      throw new PublicServiceError(
        "Cette partie a expiré ou le serveur a redémarré. Lance une nouvelle partie depuis l’accueil.",
      );
    if (plans.size >= CAPACITY)
      throw new PublicServiceError(
        "Toutes les places sont occupées pour le moment. Réessaie dans quelques minutes.",
      );
    entry = {
      fingerprint,
      expiresAt: now + TTL,
      questions: Promise.resolve().then(prepare),
    };
    plans.set(id, entry);
  }
  if (entry.fingerprint !== fingerprint)
    throw new PublicServiceError(
      "Les réglages ont changé. Lance une nouvelle partie depuis l’accueil.",
    );
  try {
    const questions = await entry.questions;
    const question = questions[roundIndex];
    if (!question)
      throw new PublicServiceError(
        "Toutes les manches de cette partie ont été jouées.",
      );
    return structuredClone(question);
  } catch (error) {
    if (roundIndex === 0 && plans.get(id) === entry) plans.delete(id);
    throw error;
  }
}
