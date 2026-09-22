// Read-only inventory: no playlist names, IDs, credentials or raw DB errors.
const { resolve } = require("node:path");
require("dotenv").config({ path: resolve(__dirname, "../.env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const reference = (value) => {
  const url = new URL(value);
  const ref =
    /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1] ||
    /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1];
  return {
    ref,
    database: url.pathname,
    schema: url.searchParams.get("schema") || "public",
  };
};
async function main() {
  const application = reference(process.env.DATABASE_URL);
  const migration = reference(
    process.env.DIRECT_URL || process.env.DATABASE_URL,
  );
  if (
    !application.ref ||
    application.ref !== migration.ref ||
    application.database !== migration.database ||
    application.schema !== migration.schema
  )
    throw new Error("Database target mismatch");
  const prisma = new PrismaClient();
  try {
    const [playlists, tracks, migrations, tableSecurity, browserGrants] =
      await Promise.all([
        prisma.playlist.count(),
        prisma.track.count(),
        prisma.$queryRaw`SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" ORDER BY started_at`,
        prisma.$queryRaw`
        SELECT c.relname AS "table", c.relrowsecurity AS "rlsEnabled",
          (SELECT COUNT(*)::integer FROM pg_policies p
           WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS "policies"
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema() AND c.relname IN
          ('Playlist', 'Track', '_PlaylistToTrack', 'AccountProfile',
           'FriendConnection', 'AccountActionAttempt', 'RoomInvitation', 'LibraryImport')
        ORDER BY c.relname`,
        prisma.$queryRaw`
        SELECT c.relname AS "table", r.rolname AS "role",
          has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "granted"
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN pg_roles r
        WHERE n.nspname = current_schema() AND r.rolname IN ('anon', 'authenticated')
          AND c.relname IN ('AccountProfile', 'FriendConnection',
            'AccountActionAttempt', 'RoomInvitation', 'LibraryImport')
        ORDER BY c.relname, r.rolname`,
      ]);
    console.info(
      JSON.stringify({
        sameSupabaseProject: true,
        schema: application.schema,
        playlists,
        tracks,
        migrations,
        tableSecurity,
        browserGrants,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Inventaire impossible ou cibles BDD/migration différentes. Aucune donnée modifiée.",
  );
  process.exitCode = 1;
});
