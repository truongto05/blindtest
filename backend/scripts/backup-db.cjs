// Read-only database backup. Generates a new private temporary artifact, never
// overwrites an existing backup and never puts credentials on a command line.
const { mkdtempSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config({ path: resolve(__dirname, "../.env"), quiet: true });

function main() {
  const prefix = "--pg-bin=";
  const bin = process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
  if (!bin)
    throw new Error("Fournir --pg-bin=<dossier de pg_dump et pg_restore>.");
  const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    (url.searchParams.get("schema") || "public") !== "public"
  )
    throw new Error("Une connexion PostgreSQL ciblant public est requise.");
  const directory = mkdtempSync(join(tmpdir(), "pulse-db-backup-"));
  const output = join(directory, "public.dump");
  const extension = process.platform === "win32" ? ".exe" : "";
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "15",
  };
  const dump = spawnSync(
    join(bin, `pg_dump${extension}`),
    [
      "--format=custom",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
      "--file",
      output,
    ],
    { env, encoding: "utf8", timeout: 120000 },
  );
  if (dump.status !== 0) {
    console.error(
      "Sauvegarde échouée ; aucune migration ne doit suivre. Les détails de connexion ne sont pas affichés.",
    );
    process.exit(1);
  }
  const check = spawnSync(
    join(bin, `pg_restore${extension}`),
    ["--list", output],
    { encoding: "utf8", timeout: 30000 },
  );
  if (check.status !== 0 || !statSync(output).size) {
    console.error("Archive non vérifiée. Ne pas appliquer la migration.");
    process.exit(1);
  }
  console.info(
    JSON.stringify({
      backup: output,
      bytes: statSync(output).size,
      archiveReadable: true,
      scope: "public",
      restored: false,
    }),
  );
}

try {
  main();
} catch {
  // URL/parser and filesystem errors may contain credentials or private paths.
  console.error(
    "Sauvegarde impossible. Vérifier la connexion PostgreSQL et --pg-bin ; aucun secret n’est affiché.",
  );
  process.exitCode = 1;
}
