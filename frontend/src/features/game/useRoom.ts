import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Notify } from "../../hooks/useToast";
import { socket } from "../../services/socketService";
import { persistedId, storage } from "../../services/storage";
import { accessToken } from "../../services/auth";
import type { QuizData, Reveal, RoomState, Settings } from "../../types/game";

type Pending = "join" | "create" | "settings" | "start" | null;
const roomCodeFromPath = (path: string) =>
  /^\/rooms\/([A-Z0-9]{6})(?:\/|$)/.exec(path)?.[1];

export function useRoom(username: string, notify: Notify) {
  const routerNavigate = useNavigate();
  const navigateRef = useRef(routerNavigate);
  useLayoutEffect(() => {
    navigateRef.current = routerNavigate;
  }, [routerNavigate]);
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      void navigateRef.current(to, options);
    },
    [],
  );
  const location = useLocation();
  const [playerToken] = useState(() => persistedId("pulse_player_id"));
  const [playerId, setPlayerId] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [round, setRound] = useState<QuizData | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [history, setHistory] = useState<QuizData[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [connection, setConnection] = useState<
    "connected" | "reconnecting" | "offline"
  >(
    !navigator.onLine
      ? "offline"
      : socket.connected
        ? "connected"
        : "reconnecting",
  );
  const pageKey = location.pathname + location.search;
  const current = useRef({ username, path: location.pathname, pageKey, room });
  useLayoutEffect(() => {
    current.current = { username, path: location.pathname, pageKey, room };
  }, [username, location.pathname, pageKey, room]);
  const pendingRef = useRef<Pending>(null);
  const pendingPath = useRef("");
  const pendingRequestId = useRef<string>();
  const entry = useRef<{
    path: string;
    code?: string;
    requestId: string;
  } | null>(null);
  const acceptedRoom = useRef<string | null>(null);
  const joiningKey = useRef("");
  const timeout = useRef<number>();

  const finishPending = useCallback(() => {
    pendingRef.current = null;
    pendingRequestId.current = undefined;
    setPending(null);
    window.clearTimeout(timeout.current);
  }, []);

  const beginPending = (action: Exclude<Pending, null>) => {
    if (!socket.connected || !navigator.onLine) {
      notify(
        "Connexion au salon indisponible. Réessaie lorsque le serveur est connecté.",
        "error",
      );
      return false;
    }
    if (pendingRef.current) return false;
    pendingRef.current = action;
    pendingPath.current = current.current.pageKey;
    pendingRequestId.current = crypto.randomUUID();
    if (action === "create")
      entry.current = {
        path: current.current.pageKey,
        requestId: pendingRequestId.current,
      };
    setPending(action);
    timeout.current = window.setTimeout(() => {
      finishPending();
      joiningKey.current = "";
      notify("Le salon ne répond pas. Réessaie dans un instant.", "error");
    }, 15_000);
    return true;
  };

  const requestJoin = useCallback(
    (code: string, name: string) => {
      if (!socket.connected || !navigator.onLine) return;
      const key = `${code}:${name}`;
      if (joiningKey.current === key) return;
      if (acceptedRoom.current && acceptedRoom.current !== code) {
        socket.emit("leave_room", { roomCode: acceptedRoom.current });
        acceptedRoom.current = null;
        current.current.room = null;
        setRoom(null);
        setRound(null);
        setReveal(null);
        setHistory([]);
        storage.remove("pulse_active_room");
      }
      joiningKey.current = key;
      const requestId =
        pendingRef.current === "join"
          ? pendingRequestId.current!
          : crypto.randomUUID();
      entry.current = { path: current.current.pageKey, code, requestId };
      socket.emit("join_room", {
        roomCode: code,
        username: name,
        playerToken,
        requestId,
      });
    },
    [playerToken],
  );

  useEffect(() => {
    if (pendingRef.current && pendingPath.current !== pageKey) finishPending();
    if (entry.current && entry.current.path !== pageKey) {
      entry.current = null;
      joiningKey.current = "";
    }
  }, [pageKey, finishPending]);

  useEffect(() => {
    const onConnect = () => {
      setConnection("connected");
      const state = current.current;
      const code = roomCodeFromPath(state.path) || state.room?.roomCode;
      if (code && state.username.trim().length >= 2) {
        requestJoin(code, state.username.trim());
      }
    };
    const onDisconnect = () => {
      setConnection(navigator.onLine ? "reconnecting" : "offline");
      joiningKey.current = "";
      entry.current = null;
      finishPending();
    };
    const onJoined = (data: {
      roomCode: string;
      playerId: string;
      requestId?: string;
    }) => {
      const intent = entry.current;
      const initiated = Boolean(
        intent &&
        intent.path === current.current.pageKey &&
        intent.requestId === data.requestId &&
        (!intent.code || intent.code === data.roomCode),
      );
      if (!initiated) {
        // An abandoned request must not restore a room or steal navigation.
        if (socket.connected && acceptedRoom.current !== data.roomCode)
          socket.emit("leave_room", { roomCode: data.roomCode });
        return;
      }
      entry.current = null;
      acceptedRoom.current = data.roomCode;
      finishPending();
      setPlayerId(data.playerId);
      storage.set("pulse_active_room", data.roomCode);
      if (initiated && roomCodeFromPath(current.current.path) !== data.roomCode)
        navigate(`/rooms/${data.roomCode}`);
    };
    const onState = (state: RoomState) => {
      const routeCode = roomCodeFromPath(current.current.path);
      if (
        acceptedRoom.current !== state.roomCode ||
        (routeCode && routeCode !== state.roomCode)
      )
        return;
      state = { ...state, clockOffsetMs: Date.now() - state.serverNow };
      const previous = current.current.room;
      if (pendingRef.current === "start" && state.phase !== "lobby")
        finishPending();
      setRoom(state);
      current.current.room = state;
      if (state.phase === "loading") {
        setRound(null);
        setReveal(null);
      }
      if (
        state.phase === "loading" &&
        state.currentRound === 1 &&
        previous?.phase !== "loading"
      )
        setHistory([]);
      if (
        state.phase !== "lobby" &&
        current.current.path.endsWith("/settings") &&
        roomCodeFromPath(current.current.path)
      ) {
        navigate(`/rooms/${state.roomCode}`, { replace: true });
      }
    };
    const onRound = (data: QuizData) => {
      if (!acceptedRoom.current) return;
      setRound(data);
      setReveal(null);
      setHistory((items) =>
        items.some((item) => item.currentRound === data.currentRound)
          ? items
          : [...items, data],
      );
    };
    const onSettingsUpdated = (data?: { requestId?: string }) => {
      if (
        pendingRef.current !== "settings" ||
        data?.requestId !== pendingRequestId.current
      )
        return;
      const stillEditing = pendingPath.current === current.current.pageKey;
      finishPending();
      const code = current.current.room?.roomCode;
      if (code && stillEditing) navigate(`/rooms/${code}`);
      notify("Réglages enregistrés.");
    };
    const onReveal = (data: Reveal) => {
      if (!acceptedRoom.current) return;
      setReveal(data);
      setHistory((items) =>
        items.map((item, index) =>
          index === items.length - 1 ? { ...item, ...data } : item,
        ),
      );
    };
    const onError = ({
      message,
      requestId,
    }: {
      message?: string;
      requestId?: string;
    }) => {
      if (
        requestId &&
        requestId !== entry.current?.requestId &&
        requestId !== pendingRequestId.current
      )
        return;
      if (!entry.current && !acceptedRoom.current && !pendingRef.current)
        return;
      entry.current = null;
      joiningKey.current = "";
      finishPending();
      notify(message || "Cette action est impossible pour le moment.", "error");
      const routeCode = roomCodeFromPath(current.current.path);
      if (routeCode && current.current.room?.roomCode !== routeCode) {
        storage.remove("pulse_active_room");
        navigate("/", { replace: true });
      }
    };
    const onKicked = () => {
      if (!acceptedRoom.current && !entry.current) return;
      acceptedRoom.current = null;
      entry.current = null;
      joiningKey.current = "";
      finishPending();
      storage.remove("pulse_active_room");
      setRoom(null);
      setRound(null);
      setReveal(null);
      setHistory([]);
      current.current.room = null;
      if (roomCodeFromPath(current.current.path)) navigate("/");
      notify(
        "Tu as quitté le salon ou ta session est ouverte sur un autre onglet.",
        "error",
      );
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("joined_room", onJoined);
    socket.on("room_state", onState);
    socket.on("settings_updated", onSettingsUpdated);
    socket.on("round_started", onRound);
    socket.on("round_revealed", onReveal);
    socket.on("room_error", onError);
    socket.on("game_error", onError);
    socket.on("kicked_from_room", onKicked);
    const onOnline = () => {
      setConnection(socket.connected ? "connected" : "reconnecting");
      if (!socket.connected) socket.connect();
    };
    const onOffline = () => {
      setConnection("offline");
      finishPending();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (socket.connected) onConnect();
    else socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.off("joined_room", onJoined);
      socket.off("room_state", onState);
      socket.off("settings_updated", onSettingsUpdated);
      socket.off("round_started", onRound);
      socket.off("round_revealed", onReveal);
      socket.off("room_error", onError);
      socket.off("game_error", onError);
      socket.off("kicked_from_room", onKicked);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearTimeout(timeout.current);
    };
  }, [navigate, notify, finishPending, requestJoin]);

  useEffect(() => {
    const code = roomCodeFromPath(location.pathname);
    if (!code || room?.roomCode === code) return;
    if (username.trim().length < 2) {
      navigate(`/?room=${code}`, { replace: true });
      return;
    }
    requestJoin(code, username.trim());
  }, [location.pathname, room?.roomCode, username, requestJoin, navigate]);

  const leave = () => {
    if (room && socket.connected && navigator.onLine)
      socket.emit("leave_room", { roomCode: room.roomCode });
    if (!navigator.onLine) socket.disconnect();
    acceptedRoom.current = null;
    entry.current = null;
    joiningKey.current = "";
    finishPending();
    storage.remove("pulse_active_room");
    setRoom(null);
    setRound(null);
    setReveal(null);
    setHistory([]);
    current.current.room = null;
    current.current.path = "/";
    current.current.pageKey = "/";
    navigate("/");
  };

  const sendAuthorized = (
    needsAccount: boolean,
    emit: (token?: string) => void,
  ) => {
    const requestId = pendingRequestId.current;
    const isCurrent = () =>
      pendingRequestId.current === requestId &&
      socket.connected &&
      navigator.onLine;
    if (!needsAccount) {
      emit();
      return;
    }
    void accessToken()
      .then((token) => {
        if (isCurrent()) emit(token);
      })
      .catch(() => {
        if (!isCurrent()) return;
        finishPending();
        notify(
          "Reconnecte-toi à ton compte pour utiliser cette playlist.",
          "error",
        );
      });
  };

  return {
    room,
    round,
    reveal,
    history,
    playerId,
    playerToken,
    connection,
    pending,
    retryConnection() {
      if (socket.connected || !navigator.onLine) return;
      setConnection("reconnecting");
      socket.disconnect().connect();
    },
    leave,
    me: room?.players.find((player) => player.playerId === playerId),
    create(settings: Settings, ownerId: string) {
      if (beginPending("create")) {
        sendAuthorized(settings.genre === "pulse", (token) => {
          socket.emit("create_room", {
            requestId: pendingRequestId.current,
            username: username.trim(),
            playerToken,
            settings,
            ...(settings.genre === "pulse"
              ? { libraryOwnerId: ownerId, accessToken: token }
              : {}),
          });
        });
      }
    },
    join(code: string, name: string) {
      if (beginPending("join"))
        requestJoin(code.trim().toUpperCase(), name.trim());
    },
    updateSettings(settings: Settings, ownerId: string) {
      if (room && beginPending("settings")) {
        sendAuthorized(settings.genre === "pulse", (token) => {
          socket.emit("update_settings", {
            requestId: pendingRequestId.current,
            roomCode: room.roomCode,
            settings,
            ...(settings.genre === "pulse"
              ? { libraryOwnerId: ownerId, accessToken: token }
              : {}),
          });
        });
      }
    },
    command(
      event: "toggle_ready" | "start_game" | "return_to_lobby",
      extra = {},
    ) {
      if (!room || !socket.connected || !navigator.onLine)
        return notify("Connexion au salon interrompue.", "error");
      if (event === "start_game") {
        if (beginPending("start"))
          sendAuthorized(room.settings.genre === "pulse", (token) => {
            socket.emit(event, {
              ...extra,
              roomCode: room.roomCode,
              requestId: pendingRequestId.current,
              ...(token ? { accessToken: token } : {}),
            });
          });
        return;
      }
      socket.emit(event, { roomCode: room.roomCode, ...extra });
    },
    kick(id: string) {
      if (room && socket.connected && navigator.onLine)
        socket.emit("kick_player", { roomCode: room.roomCode, playerId: id });
    },
    submit(answer: string) {
      if (room && socket.connected && navigator.onLine)
        socket.emit("submit_answer", {
          roomCode: room.roomCode,
          playerToken,
          answer,
        });
    },
    requestSegment(tier: number) {
      if (room && socket.connected && navigator.onLine)
        socket.emit("request_segment", { roomCode: room.roomCode, tier });
    },
  };
}
