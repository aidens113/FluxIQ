import type { StateObservationPolicy } from "../../../runtime/recording/index.ts";
export const legacyStateObservations: StateObservationPolicy = {
  isStateObservation(entry) {
    if (entry.observationType === "client.state_snapshot" || entry.observationType === "client.state_update") return true;
    const payload = entry.payload;
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && "state" in payload);
  }
};
