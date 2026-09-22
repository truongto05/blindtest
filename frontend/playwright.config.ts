import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
// Never load the application's .env: an E2E run must not silently target Supabase.
const schema =
  process.env.PULSE_E2E_SCHEMA || `pulse_e2e_${randomBytes(8).toString("hex")}`;
process.env.PULSE_E2E_SCHEMA = schema;
const isolate = (connection: string) => {
  const url = new URL(connection);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error(
      "Les tests E2E nécessitent une base PostgreSQL locale dédiée.",
    );
  url.searchParams.set("schema", schema);
  return url.toString();
};
process.env.DATABASE_URL = isolate(
  process.env.DATABASE_URL || "postgresql://pulse:pulse@localhost:5432/pulse",
);
process.env.DIRECT_URL = isolate(
  process.env.DIRECT_URL || process.env.DATABASE_URL,
);
const baseURL = "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./e2e/database-setup.cjs",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command:
        "npm run build && node --require ../frontend/e2e/provider-fixtures.cjs --require ../frontend/e2e/auth-provider-fixtures.cjs dist/index.js",
      cwd: "../backend",
      port: 3101,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: "3101",
        ALLOWED_ORIGINS: baseURL,
        NODE_ENV: "test",
        DATABASE_URL: process.env.DATABASE_URL,
        DIRECT_URL: process.env.DIRECT_URL,
        PULSE_E2E_SCHEMA: schema,
        SUPABASE_URL: "https://pulse-auth.test",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
      },
    },
    {
      command:
        "npm run build && npm run preview -- --host 127.0.0.1 --port 4175",
      port: 4175,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: "",
        VITE_SOCKET_URL: "",
        PULSE_API_PROXY: "http://127.0.0.1:3101",
        VITE_SUPABASE_URL: "https://pulse-auth.test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
      },
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
