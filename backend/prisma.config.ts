import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Generation needs no live database. Migration script requires a real URL.
    url:
      process.env.DATABASE_URL ||
      "postgresql://pulse:pulse@localhost:5432/pulse",
    directUrl:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      "postgresql://pulse:pulse@localhost:5432/pulse",
  },
});
