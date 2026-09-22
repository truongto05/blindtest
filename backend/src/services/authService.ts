import type { Request } from "express";
import fetch from "node-fetch";
import { z } from "zod";
import { PublicServiceError } from "./http";

const MAX_AUTH_BYTES = 8 * 1_024;
const AUTH_TIMEOUT_MS = 8_000;
const tokenPattern = /^[A-Za-z0-9._~+/-]+=*$/;
const identitySchema = z.object({
  id: z.uuid().transform((id) => id.toLowerCase()),
});
const confirmedAccountSchema = z.object({
  email_confirmed_at: z.iso.datetime({ offset: true }),
  is_anonymous: z.literal(false),
});

export class AuthError extends PublicServiceError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const invalidSession = () =>
  new AuthError(401, "Ta session est invalide ou a expiré. Reconnecte-toi.");
const unavailable = () =>
  new AuthError(
    503,
    "La vérification du compte est momentanément indisponible. Réessaie dans un instant.",
  );

export function accessTokenFromRequest(
  req: Pick<Request, "get">,
): string | undefined {
  const header = req.get("authorization");
  if (header === undefined) return undefined;
  if (Buffer.byteLength(header, "utf8") > MAX_AUTH_BYTES) {
    throw invalidSession();
  }
  // A single credential only: no whitespace trimming or duplicate headers.
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(header);
  if (!match || match[0] !== header) throw invalidSession();
  return match[1];
}

function authConfiguration(): { endpoint: string; apiKey: string } {
  const configuredUrl = process.env.SUPABASE_URL?.trim();
  const apiKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!configuredUrl || !apiKey) {
    throw new AuthError(
      503,
      "Les comptes ne sont pas encore configurés : SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) sont nécessaires côté serveur.",
    );
  }
  try {
    const url = new URL(configuredUrl);
    const localDevelopment =
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && localDevelopment)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      apiKey.startsWith("sb_secret_") ||
      /[\s\u0000-\u001f\u007f]/.test(apiKey)
    ) {
      throw new Error("Invalid auth configuration");
    }
    return {
      endpoint: new URL("/auth/v1/user", url).href,
      apiKey,
    };
  } catch {
    throw new AuthError(
      503,
      "La configuration des comptes est invalide. Vérifie l’URL HTTPS Supabase et sa clé publique côté serveur.",
    );
  }
}

export async function verifyAccessToken(
  token: string,
): Promise<{ id: string }> {
  if (
    Buffer.byteLength(token, "utf8") > MAX_AUTH_BYTES ||
    tokenPattern.exec(token)?.[0] !== token
  ) {
    throw invalidSession();
  }
  const { endpoint, apiKey } = authConfiguration();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    // Always ask Auth directly; never authorize from a decoded JWT or a cache.
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      signal: controller.signal,
      redirect: "error",
      size: 256 * 1_024,
    });
    if ([400, 401, 403].includes(response.status)) throw invalidSession();
    if (!response.ok) throw unavailable();
    const data: unknown = await response.json();
    const identity = identitySchema.safeParse(data);
    if (!identity.success) throw unavailable();
    if (!confirmedAccountSchema.safeParse(data).success) {
      throw new AuthError(
        403,
        "Confirme ton adresse e-mail pour utiliser les fonctionnalités de compte.",
      );
    }
    return { id: identity.data.id };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }
}

export async function requireAccount(req: Request): Promise<{ id: string }> {
  const token = accessTokenFromRequest(req);
  if (!token) {
    throw new AuthError(
      401,
      "Connecte-toi pour utiliser cette fonctionnalité.",
    );
  }
  return verifyAccessToken(token);
}
