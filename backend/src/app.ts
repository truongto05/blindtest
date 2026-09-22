import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import playlistRoutes from "./routes/playlistRoutes";
import quizRoutes from "./routes/quizRoutes";
import searchRoutes from "./routes/searchRoutes";
import socialRoutes from "./routes/socialRoutes";
import { prisma } from "./lib/prisma";
import { operationalLogging } from "./lib/operationalLogging";

type AppOptions = { allowedOrigins: string[]; trustProxy: boolean };

/** Assemble HTTP without opening a port; startup and Socket.IO live in index.ts. */
export function createApp({ allowedOrigins, trustProxy }: AppOptions) {
  const app = express();
  const isAllowed = (origin?: string) =>
    !origin || allowedOrigins.includes(origin);
  app.set("trust proxy", trustProxy ? 1 : false);
  app.disable("x-powered-by");
  app.use(operationalLogging);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(
          isAllowed(origin) ? null : new Error("Origin non autorisée"),
          isAllowed(origin),
        ),
      credentials: true,
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: process.env.NODE_ENV === "test" ? 1000 : 120,
      message: { error: "Trop de demandes. Attends une minute puis réessaie." },
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", timestamp: new Date().toISOString() }),
  );
  app.get("/api/ready", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await prisma.playlist.findFirst({
        select: { visibility: true, shareId: true },
      });
      await prisma.accountProfile.findFirst({ select: { id: true } });
      await Promise.all([
        prisma.friendConnection.findFirst({ select: { id: true } }),
        prisma.roomInvitation.findFirst({ select: { id: true } }),
        prisma.libraryImport.findFirst({ select: { id: true } }),
        prisma.accountActionAttempt.findFirst({ select: { id: true } }),
      ]);
      res.json({ status: "ready", database: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "unavailable" });
    }
  });
  app.use("/api/playlists", playlistRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/quiz", quizRoutes);
  app.use("/api/account", socialRoutes);
  app.use((_req, res) =>
    res.status(404).json({ error: "Ressource introuvable." }),
  );
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Le contenu de la demande est invalide." });
      return;
    }
    if (!res.headersSent)
      res.status(500).json({ error: "Une erreur interne est survenue." });
  };
  app.use(errorHandler);

  return app;
}
