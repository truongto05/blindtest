export async function copyText(text: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error(
      "Copie automatique indisponible. Sélectionne le lien ou le code pour le copier.",
    );
  }
}
