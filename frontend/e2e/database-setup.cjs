const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { PrismaClient } = require("../../backend/node_modules/@prisma/client");

module.exports = async () => {
  const schema = process.env.PULSE_E2E_SCHEMA;
  if (!/^pulse_e2e_[a-f0-9]{16}$/.test(schema || ""))
    throw new Error("Schéma E2E isolé invalide.");
  const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
  if (url.searchParams.get("schema") !== schema)
    throw new Error(
      "La base E2E doit cibler uniquement son schéma temporaire.",
    );
  const prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
  const cleanup = async () => {
    // Only this cryptographically generated, validated schema can be removed.
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  };
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const backend = resolve(__dirname, "../../backend");
    const migration = spawnSync(
      process.execPath,
      ["scripts/prisma-migrate.cjs"],
      { cwd: backend, env: process.env, encoding: "utf8", timeout: 90_000 },
    );
    if (migration.status !== 0)
      throw new Error(
        "Migration E2E impossible. Vérifie DIRECT_URL et les droits PostgreSQL de création de schéma.",
      );
    console.info(
      "Base de test isolée prête. Les playlists existantes ne sont pas utilisées.",
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
};
