import { io } from "socket.io-client";
const socketUrl = (import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  undefined) as string | undefined;
export const socket = io(socketUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5_000,
  timeout: 10_000,
});
