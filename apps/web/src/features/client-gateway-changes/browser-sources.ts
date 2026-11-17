import type { GatewayChangeSources, GatewayChangeStream } from "./types";

/** The real browser behind the shared subscription: `EventSource`, `fetch`, and the tab's visibility and network events. */
export function browserGatewayChangeSources(): GatewayChangeSources {
  return {
    openStream: (url) => (typeof EventSource === "undefined" ? undefined : new EventSource(url) as GatewayChangeStream),
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
    },
    onWake: (listener) => {
      const visible = () => {
        if (document.visibilityState === "visible") listener();
      };
      const hasDocument = typeof document !== "undefined" && typeof document.addEventListener === "function";
      const hasWindow = typeof window !== "undefined" && typeof window.addEventListener === "function";
      if (hasDocument) document.addEventListener("visibilitychange", visible);
      if (hasWindow) window.addEventListener("online", listener);
      return () => {
        if (hasDocument) document.removeEventListener("visibilitychange", visible);
        if (hasWindow) window.removeEventListener("online", listener);
      };
    }
  };
}
