import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { registerGameHandlers } from "./sockets/gameHandler";

const port = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isAllowed = (origin?: string) =>
  !origin || allowedOrigins.includes(origin);
const httpServer = createServer(
  createApp({
    allowedOrigins,
    trustProxy: process.env.TRUST_PROXY === "true",
  }),
);

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  maxHttpBufferSize: 32_000,
  pingInterval: 20_000,
  pingTimeout: 15_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 30_000,
    skipMiddlewares: true,
  },
});
io.use((socket, next) =>
  isAllowed(socket.handshake.headers.origin)
    ? next()
    : next(new Error("Origin non autorisée")),
);
io.on("connection", (socket) => {
  let eventCount = 0;
  let windowStarted = Date.now();
  socket.use((_event, next) => {
    const now = Date.now();
    if (now - windowStarted >= 1_000) {
      windowStarted = now;
      eventCount = 0;
    }
    eventCount += 1;
    if (eventCount > 30) return next(new Error("Trop de requêtes."));
    next();
  });
  registerGameHandlers(io, socket);
});

httpServer.listen(port, "0.0.0.0", () =>
  console.info(`Pulse API listening on port ${port}`),
);

const shutdown = (signal: string) => {
  console.info(`${signal}: arrêt gracieux`);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
