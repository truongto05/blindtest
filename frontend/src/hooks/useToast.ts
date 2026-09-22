import { useCallback, useEffect, useRef, useState } from "react";

export type Notify = (message: string, type?: "success" | "error") => void;

export function useToast() {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const timer = useRef<number>();
  const notify: Notify = useCallback((message, type = "success") => {
    window.clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = window.setTimeout(
      () => setToast(null),
      type === "error" ? 7000 : 4000,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, notify };
}
