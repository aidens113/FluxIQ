import { engineStatusFromHttp, type EngineStatus } from "../../../panel-shell";

/** Asks the panel's readiness endpoint. A request that fails outright throws, so the section says it could not reach the engine. */
export async function loadEngine(signal: AbortSignal): Promise<EngineStatus> {
  const response = await fetch("/api/ready", { cache: "no-store", signal });
  return engineStatusFromHttp(response.status);
}
