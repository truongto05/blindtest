import { useCallback, useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import { storage } from "../services/storage";

const VOLUME_KEY = "pulse_volume";
const MUTED_KEY = "pulse_muted";
export function useAudio(audioUrl: string | null) {
  const sound = useRef<Howl | null>(null);
  const timeout = useRef<number>();
  const requestedDuration = useRef<number>();
  const generation = useRef(0);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "playing" | "blocked" | "error"
  >("idle");
  const [volume, setVolumeState] = useState(() => {
    const saved = Number(storage.get(VOLUME_KEY) ?? 0.8);
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.8;
  });
  const [muted, setMutedState] = useState(
    () => storage.get(MUTED_KEY) === "true",
  );
  const [retryKey, setRetryKey] = useState(0);
  const cleanup = useCallback(() => {
    if (timeout.current) window.clearTimeout(timeout.current);
    timeout.current = undefined;
    sound.current?.unload();
    sound.current = null;
  }, []);
  useEffect(() => {
    cleanup();
    const current = ++generation.current;
    if (!audioUrl) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const loadTimer = window.setTimeout(() => {
      if (generation.current === current) {
        generation.current += 1;
        sound.current?.unload();
        setStatus("error");
      }
    }, 10_000);
    sound.current = new Howl({
      src: [audioUrl],
      html5: true,
      preload: true,
      volume: muted ? 0 : volume,
      onload: () => {
        window.clearTimeout(loadTimer);
        if (generation.current === current) setStatus("ready");
      },
      onplay: () => {
        if (generation.current !== current) return;
        setStatus("playing");
        if (timeout.current) window.clearTimeout(timeout.current);
        if (requestedDuration.current) {
          timeout.current = window.setTimeout(() => {
            if (generation.current === current) sound.current?.stop();
          }, requestedDuration.current * 1000);
        }
      },
      onpause: () => {
        if (generation.current === current) setStatus("ready");
      },
      onstop: () => {
        if (generation.current === current) setStatus("ready");
      },
      onend: () => {
        if (timeout.current) window.clearTimeout(timeout.current);
        if (generation.current === current) setStatus("ready");
      },
      onloaderror: () => {
        window.clearTimeout(loadTimer);
        if (generation.current === current) setStatus("error");
      },
      onplayerror: () => {
        if (generation.current === current) setStatus("blocked");
      },
    });
    return () => {
      generation.current += 1;
      window.clearTimeout(loadTimer);
      cleanup();
    };
  }, [audioUrl, retryKey, cleanup]);
  useEffect(() => {
    sound.current?.volume(muted ? 0 : volume);
  }, [volume, muted]);
  const play = useCallback(
    (duration?: number) => {
      if (!sound.current || status === "loading" || status === "error") return;
      if (timeout.current) clearTimeout(timeout.current);
      sound.current.stop();
      sound.current.seek(0);
      requestedDuration.current = duration;
      sound.current.play();
    },
    [status],
  );
  const stop = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    sound.current?.stop();
  }, []);
  const setVolume = (next: number) => {
    const safe = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 0.8;
    setVolumeState(safe);
    storage.set(VOLUME_KEY, String(safe));
    if (safe > 0 && muted) {
      setMutedState(false);
      storage.set(MUTED_KEY, "false");
    }
  };
  const toggleMute = () =>
    setMutedState((current) => {
      storage.set(MUTED_KEY, String(!current));
      return !current;
    });
  return {
    status,
    isPlaying: status === "playing",
    play,
    stop,
    retry: () => {
      if (status === "blocked") play(requestedDuration.current);
      else setRetryKey((n) => n + 1);
    },
    volume,
    setVolume,
    muted,
    toggleMute,
  };
}
