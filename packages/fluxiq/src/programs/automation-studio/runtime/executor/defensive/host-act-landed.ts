// The effect check's question for a node that declares no expected state (t430):
// asked of the host, from the act itself.
//
// A step written without a `done when:` gives the effect check nothing to read,
// so before this every committing act whose answer was lost there ended the run
// as Outcome uncertain -- a timed-out press of a notice's "Not now" included
// (recovery matrix row 9, t404). Core 61f6adbf answered that by trusting the
// step's `consequences: none` to press again, which let a declaration unlock a
// second act; a model under-declares (an offer button written `none`), so that
// was withdrawn. The page decides instead: the host knows what its act touched
// and can look (`AutomationStudioHostRuntimeBoundary.actLanded`), and only what
// the page showed may answer `landed` or `not_landed`.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import type { AutomationStudioEffectCheckResult } from "./effect-check.ts";

/**
 * The host's answer about the act behind a failed attempt, waiting at most
 * `timeoutMs`: `unknown` for a host with no such check, one that threw, and
 * any answer that is not one of the three.
 */
export async function automationStudioHostActLanded(
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined,
  input: { node: AutomationStudioFlowNode; attemptId: string; timeoutMs: number; signal?: AbortSignal }
): Promise<AutomationStudioEffectCheckResult> {
  const ask = hostRuntime?.actLanded;
  if (!ask) return "unknown";
  try {
    const answer = await ask.call(hostRuntime, input);
    return answer === "landed" || answer === "not_landed" ? answer : "unknown";
  } catch {
    return "unknown";
  }
}
