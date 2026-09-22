import fetch from "node-fetch";

/** Only deliberately user-facing messages may cross an API/socket boundary. */
export class PublicServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicServiceError";
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw new PublicServiceError(
        "Le catalogue musical est momentanément indisponible. Réessaie dans un instant.",
      );
    return (await response.json()) as T;
  } catch {
    throw new PublicServiceError(
      "Le catalogue ne répond pas pour le moment. Réessaie dans un instant.",
    );
  } finally {
    clearTimeout(timer);
  }
}
