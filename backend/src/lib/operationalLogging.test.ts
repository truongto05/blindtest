import express from "express";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { operationalLogging } from "./operationalLogging";
afterEach(() => vi.restoreAllMocks());
it("logs actionable failure metadata without credentials, URLs or bodies", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = express();
  app.use(operationalLogging);
  app.post("/api/account/:id", (_req, res) =>
    res.status(503).json({ error: "Unavailable" }),
  );
  const result = await request(app)
    .post("/api/account/PRIVATE_PROFILE?token=PRIVATE_QUERY")
    .set("Authorization", "Bearer PRIVATE_TOKEN")
    .set("X-Request-Id", "PRIVATE_INJECTED")
    .send({ password: "PRIVATE_PASSWORD" });
  const entry = JSON.parse(log.mock.calls[0][0]);
  expect(entry).toMatchObject({
    event: "http_failure",
    scope: "account",
    status: 503,
    requestId: result.headers["x-request-id"],
  });
  expect(JSON.stringify(entry)).not.toContain("PRIVATE_");
  expect(entry.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
it("does not produce audience logs for successful requests", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = express();
  app.use(operationalLogging);
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  await request(app).get("/api/health").expect(200);
  expect(log).not.toHaveBeenCalled();
});
