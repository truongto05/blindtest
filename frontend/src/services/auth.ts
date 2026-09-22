import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { storage } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";

function publicConfiguration() {
  if (!url || !key || key.startsWith("sb_secret_")) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      return false;
    if (
      parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)
      )
    )
      return false;
    if (key.startsWith("sb_publishable_")) return true;
    // A legacy anonymous key is public configuration, never an identity proof.
    return (
      JSON.parse(atob(key.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")))
        .role === "anon"
    );
  } catch {
    return false;
  }
}

export const authConfigured = publicConfiguration();
let client: SupabaseClient | undefined;

export function getAuthClient() {
  if (!authConfigured) return undefined;
  client ??= createClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: {
        getItem: storage.get,
        setItem: storage.set,
        removeItem: storage.remove,
      },
    },
  });
  return client;
}

export async function accessToken() {
  const auth = getAuthClient();
  if (!auth) return undefined;
  const { data, error } = await auth.auth.getSession();
  if (error)
    throw new Error("Ta session a expiré. Reconnecte-toi pour continuer.");
  return data.session?.access_token;
}

export function authMessage(error: { code?: string } | null) {
  switch (error?.code) {
    case "invalid_credentials":
      return "Adresse e-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Confirme ton adresse e-mail avec le lien reçu avant de te connecter.";
    case "weak_password":
      return "Choisis un mot de passe plus solide, avec au moins 12 caractères.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Trop de tentatives. Patiente quelques minutes avant de réessayer.";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
      return "Ce lien a expiré ou a été ouvert dans un autre navigateur. Demande un nouveau lien ici.";
    default:
      return "Cette action n’a pas abouti. Vérifie ta connexion puis réessaie.";
  }
}
