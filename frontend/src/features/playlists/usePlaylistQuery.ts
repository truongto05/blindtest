import { useCallback, useEffect, useRef, useState } from "react";

export function usePlaylistQuery<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await load();
      if (currentRequest === requestId.current) setData(result);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Chargement impossible pour le moment.",
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setData(null);
    void reload();
    return () => {
      requestId.current += 1;
    };
  }, [reload]);

  return { data, loading, error, reload, setData };
}
