import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudio } from "./useAudio";

type AudioCallbacks = {
  onload?: () => void;
  onplay?: () => void;
  onstop?: () => void;
  onloaderror?: () => void;
  onplayerror?: () => void;
};
const audioMock = vi.hoisted(() => ({
  callbacks: null as AudioCallbacks | null,
  unload: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  volume: vi.fn(),
}));

vi.mock("howler", () => ({
  Howl: class {
    constructor(callbacks: AudioCallbacks) {
      audioMock.callbacks = callbacks;
    }
    unload() {
      audioMock.unload();
    }
    play() {
      audioMock.play();
      audioMock.callbacks?.onplay?.();
    }
    stop() {
      audioMock.stop();
      audioMock.callbacks?.onstop?.();
    }
    seek(position: number) {
      audioMock.seek(position);
    }
    volume(value: number) {
      audioMock.volume(value);
    }
  },
}));

describe("useAudio", () => {
  beforeEach(() => {
    localStorage.clear();
    audioMock.callbacks = null;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("preloads, plays and releases the current audio resource", () => {
    const { result, unmount } = renderHook(() =>
      useAudio("https://example.com/preview.mp3"),
    );
    expect(result.current.status).toBe("loading");
    act(() => audioMock.callbacks?.onload?.());
    expect(result.current.status).toBe("ready");
    act(() => result.current.play());
    expect(result.current.status).toBe("playing");
    unmount();
    expect(audioMock.unload).toHaveBeenCalled();
  });

  it("turns a stalled preload into a recoverable error", () => {
    const { result } = renderHook(() =>
      useAudio("https://example.com/slow.mp3"),
    );
    act(() => vi.advanceTimersByTime(10_001));
    expect(result.current.status).toBe("error");
    expect(audioMock.unload).toHaveBeenCalled();
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
  });

  it("ignores delayed events from an unloaded excerpt", () => {
    const { result, rerender } = renderHook(({ url }) => useAudio(url), {
      initialProps: { url: "https://example.com/first.mp3" },
    });
    const oldCallbacks = audioMock.callbacks;
    rerender({ url: "https://example.com/second.mp3" });
    act(() => {
      oldCallbacks?.onload?.();
      oldCallbacks?.onplay?.();
    });
    expect(result.current.status).toBe("loading");
    act(() => audioMock.callbacks?.onload?.());
    expect(result.current.status).toBe("ready");
  });

  it("starts the short-excerpt cutoff when playback actually begins", () => {
    const { result } = renderHook(() =>
      useAudio("https://example.com/preview.mp3"),
    );
    act(() => audioMock.callbacks?.onload?.());
    act(() => result.current.play(0.1));
    const stopsBeforeCutoff = audioMock.stop.mock.calls.length;
    act(() => vi.advanceTimersByTime(99));
    expect(audioMock.stop).toHaveBeenCalledTimes(stopsBeforeCutoff);
    act(() => vi.advanceTimersByTime(1));
    expect(audioMock.stop).toHaveBeenCalledTimes(stopsBeforeCutoff + 1);
  });
});
