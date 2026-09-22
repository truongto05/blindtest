import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// Deliberately exclude URLs, query strings, headers, bodies and raw exceptions.
// This is operational failure counting, not audience or gameplay analytics.
export const operationalLogging: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const segment = req.path.split("/")[2];
  const scope = [
    "account",
    "playlists",
    "quiz",
    "search",
    "health",
    "ready",
  ].includes(segment)
    ? segment
    : "other";
  const startedAt = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => {
    if (res.statusCode >= 500)
      console.error(
        JSON.stringify({
          event: "http_failure",
          timestamp: new Date().toISOString(),
          requestId,
          scope,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
  });
  next();
};
