import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { api } from "../../services/api";
import { authConfigured, getAuthClient } from "../../services/auth";
import type { AccountData } from "../../types/account";

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(authConfigured);
  const [data, setData] = useState<AccountData>({ profile: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  const userId = session?.user.id;
  const reload = useCallback(async () => {
    const request = ++version.current;
    if (!userId) {
      setData({ profile: null });
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.account();
      if (version.current === request) setData(result);
    } catch (cause) {
      if (version.current === request) {
        setData({ profile: null });
        setError(
          cause instanceof Error
            ? cause.message
            : "Ton profil est indisponible pour le moment.",
        );
      }
    } finally {
      if (version.current === request) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const auth = getAuthClient();
    if (!auth) return;
    let active = true;
    let authEventReceived = false;
    let observedUserId: string | undefined;
    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      authEventReceived = true;
      if (observedUserId !== next?.user.id) version.current += 1;
      observedUserId = next?.user.id;
      setSession(next);
      setInitializing(false);
    });
    void auth.auth
      .getSession()
      .then(({ data: next, error: cause }) => {
        if (!active || authEventReceived) return;
        observedUserId = next.session?.user.id;
        setSession(next.session);
        if (cause)
          setError(
            "Impossible de retrouver ta session. Réessaie de te connecter.",
          );
        setInitializing(false);
      })
      .catch(() => {
        if (active && !authEventReceived) {
          setInitializing(false);
          setError("Impossible de retrouver ta session.");
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
      version.current += 1;
    };
  }, []);

  useEffect(() => {
    setData({ profile: null });
    void reload();
    return () => {
      version.current += 1;
    };
  }, [reload]);

  return {
    ...data,
    session,
    initializing,
    loading,
    error,
    configured: authConfigured,
    reload,
  };
}

export type AccountState = ReturnType<typeof useAccount>;
