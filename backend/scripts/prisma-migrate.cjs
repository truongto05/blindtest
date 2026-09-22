const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const dotenv = require("dotenv");

const backendDirectory = resolve(__dirname, "..");
dotenv.config({ path: resolve(backendDirectory, ".env") });

const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  console.error(
    "DIRECT_URL ou DATABASE_URL doit être défini pour appliquer les migrations.",
  );
  process.exit(1);
}

const prismaCli = resolve(
  backendDirectory,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: backendDirectory,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: migrationUrl, DIRECT_URL: migrationUrl },
});

if (result.error) {
  console.error(
    `Impossible de lancer Prisma Migrate : ${result.error.message}`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
