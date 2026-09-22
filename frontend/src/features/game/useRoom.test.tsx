import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type RoomState } from "../../types/game";
import { useRoom } from "./useRoom";
import { accessToken } from "../../services/auth";
vi.mock("../../services/auth", () => ({
  accessToken: vi.fn(async () => "account-token"),
}));

const mock = vi.hoisted(() => ({
  connected: true,
  listeners: new Map<string, Set<(data: unknown) => void>>(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../../services/socketService", () => ({
  socket: {
    get connected() {
      return mock.connected;
    },
    emit: mock.emit,
    connect: mock.connect,
    disconnect() {
      mock.disconnect();
      return this;
    },
    on(event: string, callback: (data: unknown) => void) {
      if (!mock.listeners.has(event)) mock.listeners.set(event, new Set());
      mock.listeners.get(event)!.add(callback);
    },
    off(event: string, callback: (data: unknown) => void) {
      mock.listeners.get(event)?.delete(callback);
    },
  },
}));
const receive = (event: string, data?: unknown) => {
  for (const callback of mock.listeners.get(event) || []) callback(data);
};
const notify = vi.fn();
const room: RoomState = {
  roomCode: "ABC123",
  phase: "lobby",
  currentRound: 0,
  totalRounds: 10,
  settings: DEFAULT_SETTINGS,
  players: [],
  serverNow: Date.now(),
  deadline: null,
};
const mount = (path = "/") =>
  renderHook(
    () => ({
      ...useRoom("Nina", notify),
      path: useLocation().pathname,
      go: useNavigate(),
    }),
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      ),
    },
  );
const acknowledge = () => {
  const payload = [...mock.emit.mock.calls]
    .reverse()
    .find(
      ([event]) => event === "create_room" || event === "join_room",
    )?.[1] as { requestId?: string } | undefined;
  receive("joined_room", {
    requestId: payload?.requestId,
    roomCode: room.roomCode,
    playerId: "public-player",
  });
  receive("room_state", room);
};

describe("room connection and request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mock.connected = true;
    mock.listeners.clear();
    localStorage.clear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not send an abandoned private creation after token refresh", async () => {
    let release!: (value: string) => void;
    vi.mocked(accessToken).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result } = mount("/rooms/new");
    act(() =>
      result.current.create({ ...DEFAULT_SETTINGS, genre: "pulse" }, "owner"),
    );
    act(() => {
      void result.current.go("/playlists");
    });
    await act(async () => {
      release("private-token");
    });
    expect(mock.emit).not.toHaveBeenCalled();
  });

  it("sends the current token once to start an account playlist", async () => {
    const { result } = mount("/rooms/ABC123");
    act(acknowledge);
    act(() =>
      receive("room_state", {
        ...room,
        settings: { ...DEFAULT_SETTINGS, genre: "pulse" },
      }),
    );
    mock.emit.mockClear();
    await act(async () => {
      result.current.command("start_game");
      result.current.command("start_game");
    });
    expect(mock.emit).toHaveBeenCalledOnce();
    expect(mock.emit).toHaveBeenCalledWith(
      "start_game",
      expect.objectContaining({
        accessToken: "account-token",
        roomCode: "ABC123",
      }),
    );
    expect(result.current.pending).toBe("start");
    act(() => receive("room_state", { ...room, phase: "loading" }));
    expect(result.current.pending).toBeNull();
  });

  it("emits a single join for a direct room route, then rejoins once after a disconnect", () => {
    mount("/rooms/ABC123");
    expect(mock.emit).toHaveBeenCalledTimes(1);
    expect(mock.emit.mock.calls[0]?.[0]).toBe("join_room");
    act(() => {
      mock.connected = false;
      receive("disconnect");
      mock.connected = true;
      receive("connect");
    });
    expect(mock.emit).toHaveBeenCalledTimes(2);
  });

  it("does not queue writes offline and reconnects without replaying them", () => {
    mock.connected = false;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = mount();
    expect(result.current.connection).toBe("offline");
    act(() => {
      result.current.create(DEFAULT_SETTINGS, "owner");
      result.current.join("ABC123", "Nina");
    });
    expect(mock.emit).not.toHaveBeenCalled();
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.connection).toBe("reconnecting");
    expect(mock.connect).toHaveBeenCalled();
    act(() => {
      mock.connected = true;
      receive("connect");
    });
    expect(result.current.connection).toBe("connected");
    expect(mock.emit).not.toHaveBeenCalled();
  });

  it("guards repeated create clicks while the acknowledgement is pending", () => {
    const { result } = mount("/rooms/new");
    act(() => {
      result.current.create(DEFAULT_SETTINGS, "owner");
      result.current.create(DEFAULT_SETTINGS, "owner");
    });
    expect(mock.emit).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe("create");
    act(acknowledge);
    expect(result.current.pending).toBeNull();
    expect(result.current.path).toBe("/rooms/ABC123");
    expect(result.current.room?.roomCode).toBe("ABC123");
  });

  it("times out visibly without automatically creating another room", () => {
    const { result } = mount("/rooms/new");
    act(() => result.current.create(DEFAULT_SETTINGS, "owner"));
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.pending).toBeNull();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("ne répond pas"),
      "error",
    );
    expect(mock.emit).toHaveBeenCalledTimes(1);
    // A late successful response is still useful if the player stayed here.
    act(acknowledge);
    expect(result.current.path).toBe("/rooms/ABC123");
  });

  it("leaves an abandoned creation when its late acknowledgement arrives, without navigating", () => {
    const { result } = mount("/rooms/new");
    act(() => result.current.create(DEFAULT_SETTINGS, "owner"));
    act(() => {
      void result.current.go("/playlists");
    });
    expect(result.current.pending).toBeNull();
    act(acknowledge);
    expect(result.current.path).toBe("/playlists");
    expect(result.current.room).toBeNull();
    expect(mock.emit).toHaveBeenLastCalledWith("leave_room", {
      roomCode: "ABC123",
    });
    expect(localStorage.getItem("pulse_active_room")).toBeNull();
  });

  it("does not pull the player back after an abandoned settings save", () => {
    const { result } = mount("/rooms/ABC123");
    act(acknowledge);
    act(() => {
      void result.current.go("/rooms/ABC123/settings");
    });
    act(() => result.current.updateSettings(DEFAULT_SETTINGS, "owner"));
    act(() => {
      void result.current.go("/playlists");
    });
    act(() => receive("settings_updated"));
    expect(result.current.path).toBe("/playlists");
    expect(result.current.pending).toBeNull();
  });

  it("does not confuse an old creation with a newer request on the same page", () => {
    const { result } = mount("/rooms/new");
    act(() => result.current.create(DEFAULT_SETTINGS, "owner"));
    const oldRequestId = (
      mock.emit.mock.calls.at(-1)?.[1] as { requestId: string }
    ).requestId;
    act(() => {
      void result.current.go("/");
    });
    act(() => {
      void result.current.go("/rooms/new");
    });
    act(() =>
      result.current.create({ ...DEFAULT_SETTINGS, rounds: 7 }, "owner"),
    );
    act(() => {
      receive("joined_room", {
        roomCode: "OLD123",
        playerId: "old-player",
        requestId: oldRequestId,
      });
      receive("room_error", { message: "Old error", requestId: oldRequestId });
    });
    expect(result.current.path).toBe("/rooms/new");
    expect(result.current.pending).toBe("create");
    expect(result.current.room).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    act(acknowledge);
    expect(result.current.path).toBe("/rooms/ABC123");
  });

  it("cancels the old invitation when only the URL query changes", () => {
    const { result } = mount("/?room=ABC123");
    act(() => result.current.join("ABC123", "Nina"));
    act(() => {
      void result.current.go("/?room=DEF456");
    });
    act(acknowledge);
    expect(result.current.path).toBe("/");
    expect(result.current.pending).toBeNull();
    expect(result.current.room).toBeNull();
  });

  it("ignores restored state after leaving offline and never buffers a leave", () => {
    const { result } = mount("/rooms/ABC123");
    act(acknowledge);
    act(() => {
      mock.connected = false;
      receive("disconnect");
    });
    mock.emit.mockClear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => result.current.leave());
    expect(mock.disconnect).toHaveBeenCalledOnce();
    expect(mock.emit).not.toHaveBeenCalled();
    act(() => {
      receive("room_state", room);
      receive("round_started", { trackId: 1 });
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      mock.connected = true;
      receive("connect");
    });
    expect(result.current.path).toBe("/");
    expect(result.current.room).toBeNull();
    expect(result.current.round).toBeNull();
    expect(mock.emit).not.toHaveBeenCalled();
  });

  it("drops the old room when another room is requested and handles a refusal", () => {
    const { result } = mount("/rooms/ABC123");
    act(acknowledge);
    act(() => {
      void result.current.go("/rooms/DEF456");
    });
    expect(result.current.room).toBeNull();
    expect(mock.emit).toHaveBeenCalledWith("leave_room", {
      roomCode: "ABC123",
    });
    expect(mock.emit).toHaveBeenLastCalledWith(
      "join_room",
      expect.objectContaining({ roomCode: "DEF456" }),
    );
    act(() => receive("room_error", { message: "Salon introuvable." }));
    expect(result.current.path).toBe("/");
    expect(notify).toHaveBeenCalledWith("Salon introuvable.", "error");
  });

  it("updates offline status immediately and releases listeners on unmount", () => {
    const { result, unmount } = mount();
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.connection).toBe("offline");
    unmount();
    expect(
      [...mock.listeners.values()].every((callbacks) => callbacks.size === 0),
    ).toBe(true);
    act(() => vi.advanceTimersByTime(20_000));
    expect(notify).not.toHaveBeenCalled();
  });
});
