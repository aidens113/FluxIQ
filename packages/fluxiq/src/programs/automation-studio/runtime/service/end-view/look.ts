// One look at the page a run or a build's test ended on, for its judge.
//
// **Why (t174-w89; t174-w87 Cause 7, run `run-murwd8le-79e735a8`).** The run's
// judges -- of its tests (0046, 0047) and after it (0069, 0071) -- read status
// rows and outcome words, never the page. `Cart (3)`, the coupon's "Collected"
// and the quantity field were on it, and one judge invented a quantity that was
// never committed. A passing replayed press answers without a page, and nothing
// in a run's record holds one, so the page has to be looked at.
//
// **The look is the domain's own.** The free first look a domain declares
// (`runsNodes.initial`, which the library tool carries as its
// `initialObservation`) is the one call a domain states only looks; Core sends
// it as given and keeps only the keys the domain declared its view under
// (`observedStateKeys`, top-level ones), so the judge gets the page and not
// the look's bookkeeping. The summary screens what it is given
// (`../../result-verification/result-summary.ts`).
//
// **Bounded in time.** The look runs inside a judgement's deadline, so one that
// does not come back is cancelled and fails with a `TimeoutError` rather than
// turning the whole check into one that never finished. A look that answers
// without a view is no view; one that fails is the caller's to read: the
// post-run check says it as withheld, a build's test drops it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import type { AutomationStudioResultEndView } from "../../result-verification/index.ts";

/** How long one look may take before it is cancelled. */
const LOOK_TIMEOUT_MS = 10_000;

/** One look, made through the executor the caller lends it. */
export type AutomationStudioEndViewLook = (request: {
  callId: string;
  /** What the view is taken after: a test's step number, or the node a run ran last. */
  after?: number | string | undefined;
  executeTool(call: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  signal?: AbortSignal | undefined;
}) => Promise<AutomationStudioResultEndView | undefined>;

/**
 * The look for a domain whose tools are `tools` and whose view keys are
 * `viewKeys`, or nothing when it declares no free look or no top-level view
 * key -- there is then nothing to look with, or nothing to keep.
 */
export function automationStudioEndViewLook(input: {
  tools: readonly Pick<AutomationStudioLlmEvidenceTool, "toolId" | "initialObservation">[];
  viewKeys: readonly string[] | undefined;
  timeoutMs?: number;
}): AutomationStudioEndViewLook | undefined {
  const tool = input.tools.find((each) => each.initialObservation);
  const keys = (input.viewKeys ?? []).filter((key) => !key.includes("."));
  if (!tool?.initialObservation || !keys.length) return undefined;
  const { toolId } = tool;
  const value = tool.initialObservation.input;
  const timeoutMs = input.timeoutMs ?? LOOK_TIMEOUT_MS;
  return async (request) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const stopped = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const ran = await Promise.race([request.executeTool({ callId: request.callId, toolId, value: structuredClone(value), signal }), stopped]);
    const evidence: unknown = isObject(ran) && ran.kind === "llm_evidence_tool_execution" ? (ran as AutomationStudioLlmEvidenceToolExecutionResult).evidence : ran;
    if (!isObject(evidence)) return undefined;
    const view = Object.fromEntries(keys.filter((key) => Object.hasOwn(evidence, key)).map((key) => [key, evidence[key]!]));
    return Object.keys(view).length ? { ...(request.after === undefined ? {} : { after: request.after }), view } : undefined;
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
