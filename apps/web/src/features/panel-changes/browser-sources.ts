import type { PanelChangeEventStream, PanelChangeSources } from "./types";

/** The real browser behind the connection: `EventSource`, and the tab's visibility and network events. */
export function browserPanelChangeSources(): PanelChangeSources {
  return {
    openStream: (url) => (typeof EventSource === "undefined" ? undefined : new EventSource(url) as unknown as PanelChangeEventStream),
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
