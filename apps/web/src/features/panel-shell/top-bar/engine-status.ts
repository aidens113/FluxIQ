export type EngineStatus = { label: string; tone: "ok" | "warn" | "unknown" };

export const ENGINE_UNKNOWN: EngineStatus = { label: "—", tone: "unknown" };

/** What the readiness check's answer says, in plain words: 200 is running, 503 is not ready yet, anything else is not known. */
export function engineStatusFromHttp(status: number): EngineStatus {
  if (status === 200) return { label: "Running", tone: "ok" };
  if (status === 503) return { label: "Not ready", tone: "warn" };
  return ENGINE_UNKNOWN;
}
