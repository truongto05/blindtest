import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() =>
  Object.fromEntries(
    [
      "playlist",
      "accountProfile",
      "friendConnection",
      "roomInvitation",
      "libraryImport",
      "accountActionAttempt",
    ].map((name) => [name, { findFirst: vi.fn() }]),
  ),
);
vi.mock("./lib/prisma", () => ({ prisma: database }));
import { createApp } from "./app";

beforeEach(() => {
  vi.resetAllMocks();
  for (const model of Object.values(database))
    model.findFirst.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("HTTP application assembly", () => {
  const app = () =>
    createApp({ allowedOrigins: ["https://pulse.example"], trustProxy: false });
  it("serves liveness and security headers without querying the database", async () => {
    const response = await request(app()).get("/api/health").expect(200);
    expect(response.body.status).toBe("ok");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toBeTruthy();
    for (const model of Object.values(database))
      expect(model.findFirst).not.toHaveBeenCalled();
  });
  it("checks all required models before reporting readiness", async () => {
    const response = await request(app()).get("/api/ready").expect(200);
    expect(response.body).toEqual({ status: "ready", database: "ok" });
    expect(response.headers["cache-control"]).toBe("no-store");
    for (const model of Object.values(database))
      expect(model.findFirst).toHaveBeenCalledOnce();
  });
  it("returns a sanitized 503 if the account schema is unavailable", async () => {
    database.accountProfile!.findFirst.mockRejectedValue(
      new Error("PRIVATE_DATABASE_DETAIL"),
    );
    const response = await request(app()).get("/api/ready").expect(503);
    expect(response.body).toEqual({
      status: "unavailable",
      database: "unavailable",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "PRIVATE_DATABASE_DETAIL",
    );
  });
  it("allows preflight for the configured frontend origin", async () => {
    const response = await request(app())
      .options("/api/playlists")
      .set("Origin", "https://pulse.example")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://pulse.example",
    );
  });
  it("rejects a foreign origin without accessing the database", async () => {
    const response = await request(app())
      .get("/api/ready")
      .set("Origin", "https://other.example")
      .expect(500);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    for (const model of Object.values(database))
      expect(model.findFirst).not.toHaveBeenCalled();
  });
  it("returns a JSON 400 for malformed request bodies", async () => {
    const response = await request(app())
      .post("/api/playlists")
      .set("Content-Type", "application/json")
      .send('{"invalid":')
      .expect(400);
    expect(response.body).toEqual({
      error: "Le contenu de la demande est invalide.",
    });
  });
  it("returns a stable JSON 404 for unknown routes", async () => {
    const response = await request(app()).get("/api/missing").expect(404);
    expect(response.body).toEqual({ error: "Ressource introuvable." });
  });
});
