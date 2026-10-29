// The host's match of a stale item among its source's fresh answer, read
// defensively (t786, design D3 step 4).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import type { AutomationStudioTargetReacquireAnswer, AutomationStudioTargetReacquireRequest } from "./contracts.ts";

/** What the host's answer comes to, with why it was read as `unmatched` when it was not one. */
export type AutomationStudioReacquireHostReading =
  | AutomationStudioTargetReacquireAnswer
  | { outcome: "unmatched"; reason: "host_failed" | "malformed_answer" };

/**
 * Asks `host.reacquireTarget` once. A throw reads as `unmatched` (`host_failed`)
 * and an answer outside the contract as `unmatched` (`malformed_answer`): the
 * step spends its remaining retries on the binding it had. A host without the
 * method is never asked (the caller records `unavailable` before re-running
 * anything).
 */
export async function automationStudioReacquireHostAnswer(
  host: AutomationStudioHostRuntimeBoundary,
  request: AutomationStudioTargetReacquireRequest
): Promise<AutomationStudioReacquireHostReading> {
  let answer: unknown;
  try {
    answer = await host.reacquireTarget?.(request);
  } catch {
    // The host's own failure text may quote the page, so only the fact that it failed is kept.
    return { outcome: "unmatched", reason: "host_failed" };
  }
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { outcome: "unmatched", reason: "malformed_answer" };
  const read = answer as { outcome?: unknown; value?: unknown; reason?: unknown };
  if (read.outcome === "found" && read.value !== undefined && read.value !== null) return { outcome: "found", value: read.value as JsonValue };
  if (read.outcome === "gone") return { outcome: "gone" };
  if (read.outcome === "unmatched" && (read.reason === "ambiguous" || read.reason === "unidentifiable")) return { outcome: "unmatched", reason: read.reason };
  return { outcome: "unmatched", reason: "malformed_answer" };
}
