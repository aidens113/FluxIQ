import { sharedPanelChanges } from "../panel-changes";
import type { GatewayChangeSources } from "./types";

/** The real browser behind the shared subscription: the page's one change stream and `fetch`. */
export function browserGatewayChangeSources(): GatewayChangeSources {
  return {
    changes: sharedPanelChanges(),
    readSnapshot: async () => {
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // A body that is not JSON is a failed read; the status says the rest.
        body = undefined;
      }
      return { ok: response.ok, status: response.status, body };
    }
  };
}
