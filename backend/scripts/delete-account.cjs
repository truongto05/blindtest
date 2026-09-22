// Operator-only account erasure. Dry-run by default; never part of HTTP routing.
require("dotenv").config({ quiet: true });
const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function eraseAccount({ id, confirm, prisma, removeIdentity }) {
  if (!uuid.test(id || ""))
    throw new Error("Identifiant de compte UUID requis.");
  id = id.toLowerCase();
  if (confirm && confirm.toLowerCase() !== id)
    throw new Error(
      "La confirmation doit correspondre exactement au compte ciblé.",
    );
  const profile = await prisma.accountProfile.findUnique({ where: { id } });
  const playlists = profile
    ? await prisma.playlist.count({
        where: { ownerId: profile.libraryOwnerId },
      })
    : 0;
  if (!confirm)
    return { dryRun: true, id, profile: Boolean(profile), playlists };
  // Auth first: outstanding JWTs cannot pass Pulse's live get-user verification.
  // A 404 is retryable: the previous attempt may have removed Auth before a DB error.
  await removeIdentity(id);
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.accountProfile.findUnique({ where: { id } });
      if (current) {
        await tx.playlist.deleteMany({
          where: { ownerId: current.libraryOwnerId },
        });
        await tx.accountProfile.delete({ where: { id } });
      }
    },
    { isolationLevel: "Serializable" },
  );
  return { dryRun: false, id, playlists };
}

async function removeIdentity(id) {
  const url = new URL(process.env.SUPABASE_URL || "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  const legacyServiceKey = () => {
    try {
      return (
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "service_role"
      );
    } catch {
      return false;
    }
  };
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(key.startsWith("sb_secret_") || legacyServiceKey())
  )
    throw new Error(
      "URL Supabase HTTPS et clé administrative serveur requises pour confirmer l’effacement.",
    );
  const response = await fetch(new URL(`/auth/v1/admin/users/${id}`, url), {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    size: 256 * 1024,
  });
  if (!response.ok && response.status !== 404)
    throw new Error(
      "Supabase Auth n’a pas confirmé la suppression. Aucune donnée Pulse supprimée.",
    );
}

if (require.main === module) {
  if (process.argv.includes("--help")) {
    console.info(
      "Depuis backend : node scripts/delete-account.cjs --id=<UUID> [--confirm=<même UUID>]. Simulation par défaut. Lire docs/effacement-compte.md avant confirmation.",
    );
  } else {
    const arg = (name) =>
      process.argv
        .find((value) => value.startsWith(`--${name}=`))
        ?.slice(name.length + 3);
    const prisma = new PrismaClient();
    eraseAccount({
      id: arg("id"),
      confirm: arg("confirm"),
      prisma,
      removeIdentity,
    })
      .then((result) => console.info(JSON.stringify(result)))
      .catch(() => {
        console.error(
          "Effacement non terminé. Vérifier la configuration, l’identité ciblée et l’état Auth. Si Auth est déjà supprimé, reprendre le nettoyage avec le même UUID. Aucun secret n’est affiché.",
        );
        process.exitCode = 1;
      })
      .finally(() => prisma.$disconnect());
  }
}
module.exports = { eraseAccount };
