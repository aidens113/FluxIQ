"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGatewayChanges, type GatewayChangeStatus } from "../../client-gateway-changes";
import { connectView, type ConnectView } from "./connect-view";
import { loadDiscovery, type DiscoveryRead } from "./load-discovery";

export type ConnectState = { state: "loading" } | { state: "error" } | { state: "ready"; view: ConnectView };

/**
 * The connect view. Its gateway part comes from the page's shared gateway
 * subscription, so a new request, an approval or a disconnect appears as it
 * happens rather than on a timer; `live` says whether that subscription is
 * hearing changes. A failed read keeps what was shown; only a failure before
 * anything was shown is an error. `reload` reads the snapshot again at once,
 * and after an error the discovery document too.
 */
export function useConnectView(): { state: ConnectState; reload: () => void; live: GatewayChangeStatus } {
  const changes = useGatewayChanges();
  const refresh = changes.refresh;
  const [discovery, setDiscovery] = useState<DiscoveryRead | undefined>(undefined);
  const [discoveryVersion, setDiscoveryVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadDiscovery(controller.signal).then((read) => {
      if (!controller.signal.aborted) setDiscovery(read);
    });
    return () => controller.abort();
  }, [discoveryVersion]);
  const snapshot = changes.snapshot;
  const state = useMemo<ConnectState>(() => {
    if (snapshot && discovery) return { state: "ready", view: connectView(snapshot, discovery, window.location.origin, Date.now()) };
    if (changes.readFailed && !snapshot) return { state: "error" };
    return { state: "loading" };
  }, [changes.readFailed, discovery, snapshot]);
  const failed = state.state === "error";
  const reload = useCallback(() => {
    if (failed) setDiscoveryVersion((current) => current + 1);
    refresh();
  }, [failed, refresh]);
  return { state, reload, live: changes.status };
}
