// How an episode's work ending maps onto its trace's termination: settling is
// `completed`, an `AbortError` (a cancelled build or run) is `cancelled`, any
// other throw is `failed`. The detail names the error and its message, unless
// the message is itself secret-shaped, in which case only the name is kept.

import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import type { AutomationStudioGatewayTraceTermination } from "./types.ts";

const MAX_DETAIL_LENGTH = 500;

/** The termination of work that threw `error`. */
export function automationStudioGatewayTraceTerminationOf(error: unknown): AutomationStudioGatewayTraceTermination {
  const name = typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string" ? (error as { name: string }).name : null;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const reason = name === "AbortError" ? "cancelled" : "failed";
  const named = name ?? "Error";
  const detail = message && !screenAutomationStudioLlmEvidence(message, []).secretShaped ? `${named}: ${message}` : named;
  return { terminationReason: reason, terminationDetail: detail.slice(0, MAX_DETAIL_LENGTH) };
}
