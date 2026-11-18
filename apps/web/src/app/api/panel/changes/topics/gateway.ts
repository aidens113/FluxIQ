import { createHash } from "node:crypto";
import type { ClientGatewayChangesPort } from "fluxiq/client-gateway";
import type { PanelChangeTopic } from "./types";

function fingerprintOf(view: unknown): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("hex");
}

/**
 * The gateway snapshot as a topic: a change each time THIS caller's own view
 * of the gateway's pairings and clients changed.
 *
 * `view` answers the caller's view as the snapshot route would serve it,
 * already filtered to what the caller may know, and refuses (throws) once the
 * caller may no longer read the snapshot. The topic remembers a fingerprint of
 * it, recomputes it on every gateway signal, and reports a change only when the
 * fingerprint differs, so a signal for a pairing or client the caller cannot
 * see produces nothing. It reads the view once per burst of signals, one read
 * at a time. A view that cannot be read fails the stream.
 */
export function gatewayChangeTopic(changes: ClientGatewayChangesPort, view: () => Promise<unknown>): PanelChangeTopic {
  return {
    start(sink) {
      let fingerprint: string | undefined;
      let recomputing = false;
      let dirty = true;
      let stopped = false;
      const recompute = async (): Promise<void> => {
        if (recomputing) return;
        recomputing = true;
        try {
          while (dirty && !stopped) {
            dirty = false;
            const next = fingerprintOf(await view());
            if (stopped) return;
            const changed = fingerprint !== undefined && next !== fingerprint;
            fingerprint = next;
            if (changed) sink.changed({ topic: "gateway" });
          }
        } catch (error) {
          if (!stopped) sink.fail(error);
        } finally {
          recomputing = false;
        }
      };
      // Subscribed before the first view is read, so a change during that read is compared against it.
      const unsubscribe = changes.subscribe(() => {
        if (stopped) return;
        dirty = true;
        void recompute();
      });
      void recompute();
      return () => {
        stopped = true;
        unsubscribe();
      };
    }
  };
}
