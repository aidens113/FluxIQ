"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadConnect, type ConnectView } from "./load-connect";

const POLL_MS = 4_000;

export type ConnectState = { state: "loading" } | { state: "error" } | { state: "ready"; view: ConnectView };

/** The connect view, refreshed every few seconds so a new request appears on its own. A failed refresh keeps what was shown; only a first failure shows the error. The reload function retries at once. */
export function useConnectView(): { state: ConnectState; reload: () => void } {
  const [state, setState] = useState<ConnectState>({ state: "loading" });
  const [version, setVersion] = useState(0);
  const shown = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const ask = async () => {
      try {
        const view = await loadConnect(controller.signal, window.location.origin, Date.now());
        if (controller.signal.aborted) return;
        shown.current = true;
        setState({ state: "ready", view });
      } catch {
        if (!controller.signal.aborted && !shown.current) setState({ state: "error" });
      }
    };
    void ask();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void ask();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [version]);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const retry = useCallback(() => {
    shown.current = false;
    setState({ state: "loading" });
    reload();
  }, [reload]);
  return { state, reload: state.state === "error" ? retry : reload };
}
