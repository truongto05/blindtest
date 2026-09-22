const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(__dirname, "../.env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const direct = process.argv.includes("--direct");
const connection = direct ? process.env.DIRECT_URL : process.env.DATABASE_URL;
const prisma = new PrismaClient(
  connection ? { datasources: { db: { url: connection } } } : undefined,
);

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.info("Connexion PostgreSQL : OK");
    await prisma.playlist.findFirst({
      select: { visibility: true, shareId: true },
    });
    console.info("Schéma playlists : OK");
    await prisma.accountProfile.findFirst({ select: { id: true } });
    await prisma.friendConnection.findFirst({ select: { id: true } });
    await prisma.roomInvitation.findFirst({ select: { id: true } });
    await prisma.libraryImport.findFirst({ select: { id: true } });
    await prisma.accountActionAttempt.findFirst({ select: { id: true } });
    console.info("Schéma comptes et amis : OK");
  } catch (error) {
    console.error(
      "Base non disponible ou migrations manquantes. Code :",
      error.code || error.errorCode || error.name,
    );
    console.info(
      "DATABASE_URL renseignée :",
      Boolean(process.env.DATABASE_URL),
    );
    let detail = error.message || "";
    for (const connection of [
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
    ].filter(Boolean)) {
      detail = detail.split(connection).join("[connexion masquée]");
      try {
        const parsed = new URL(connection);
        for (const secret of [
          parsed.password,
          decodeURIComponent(parsed.password),
          parsed.username,
        ].filter(Boolean))
          detail = detail.split(secret).join("***");
      } catch {
        /* Invalid connection is reported without its value. */
      }
    }
    console.error(detail);
    console.error("Vérifie backend/.env puis lance npm run db:migrate.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
