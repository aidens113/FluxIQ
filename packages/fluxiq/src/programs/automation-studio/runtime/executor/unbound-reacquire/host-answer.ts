import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { automationStudioRefreshSnapshot } from "../parameter-refresh/index.ts";
import type { AutomationStudioTargetRefreshPatch } from "../parameter-refresh/index.ts";
import type { AutomationStudioUnboundTargetReacquireAnswer } from "./answer.ts";
import type { AutomationStudioUnboundTargetReacquireRequest } from "./request.ts";

/** One read-only lookup, parsed without getters or retained host/page error text. */
export async function automationStudioUnboundReacquireAnswer(host: AutomationStudioHostRuntimeBoundary, request: AutomationStudioUnboundTargetReacquireRequest): Promise<AutomationStudioUnboundTargetReacquireAnswer | { outcome: "unmatched"; reason: "host_failed" | "malformed_answer" }> {
  let raw: unknown;
  try {
    raw = await host.reacquireUnboundTarget?.(request);
  } catch {
    return { outcome: "unmatched", reason: "host_failed" };
  }
  const copied = automationStudioRefreshSnapshot(raw);
  if (copied.kind !== "copied" || !copied.value || typeof copied.value !== "object" || Array.isArray(copied.value)) return { outcome: "unmatched", reason: "malformed_answer" };
  const answer = copied.value;
  const keys = Object.keys(answer);
  if (answer.outcome === "found" && Array.isArray(answer.patches) && keys.every((key) => key === "outcome" || key === "patches")) return { outcome: "found", patches: answer.patches as unknown as readonly AutomationStudioTargetRefreshPatch[] };
  if (answer.outcome === "gone" && answer.coverage === "complete" && keys.every((key) => key === "outcome" || key === "coverage")) return { outcome: "gone", coverage: "complete" };
  if (answer.outcome === "unmatched" && (answer.reason === "ambiguous" || answer.reason === "unidentifiable") && keys.every((key) => key === "outcome" || key === "reason")) return { outcome: "unmatched", reason: answer.reason };
  if (answer.outcome === "unavailable" && (answer.reason === "observation_unavailable" || answer.reason === "observation_incomplete" || answer.reason === "place_unproved" || answer.reason === "unsupported_target") && keys.every((key) => key === "outcome" || key === "reason")) return { outcome: "unavailable", reason: answer.reason };
  return { outcome: "unmatched", reason: "malformed_answer" };
}
