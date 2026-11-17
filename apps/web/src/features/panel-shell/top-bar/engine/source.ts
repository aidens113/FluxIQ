import { createSharedSource, type SharedSource } from "../../shared";
import { ENGINE_UNKNOWN, engineStatusFromHttp } from "./status";
import { ENGINE_NOT_READ, type EngineReading } from "./reading";

const REFRESH_MS = 30_000;

/** The one readiness poller for the top bar and Home. It stops while the tab is hidden and checks again on return. A failed ask is "—", not "Not ready". */
export const engineSource: SharedSource<EngineReading> = createSharedSource<EngineReading>({
  initial: ENGINE_NOT_READ,
  failed: () => ({ status: ENGINE_UNKNOWN, loaded: true }),
  pollMs: REFRESH_MS,
  read: async (_previous, signal) => {
    try {
      const response = await fetch("/api/ready", { cache: "no-store", signal });
      return { status: engineStatusFromHttp(response.status), loaded: true };
    } catch {
      return { status: ENGINE_UNKNOWN, loaded: true };
    }
  }
});
