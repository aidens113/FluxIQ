import { SESSION_RESTORED_EVENT } from "./session-restored-event";
import type { PanelChangeEventStream, PanelChangeSources } from "./types";

/** The real browser behind the connection: `EventSource`, and the tab's visibility, network and restored-session events. */
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
      if (hasWindow) {
        window.addEventListener("online", listener);
        // Signing in again in place: a stream refused while the session had lapsed can open now.
        window.addEventListener(SESSION_RESTORED_EVENT, listener);
      }
      return () => {
        if (hasDocument) document.removeEventListener("visibilitychange", visible);
        if (hasWindow) {
          window.removeEventListener("online", listener);
          window.removeEventListener(SESSION_RESTORED_EVENT, listener);
        }
      };
    }
  };
}
