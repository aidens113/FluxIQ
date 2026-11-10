// A sometimes-present step whose control the page does not show, found at once (task speed S10).
//
// A build that met a layer -- a prompt, a popup, a cookie banner -- and pressed its way out saves that
// press as an optional step (`../step-skip/optional-step.ts`). On a later run the layer is often not
// there: the site remembered it was closed, or never opened it this time. The step was dispatched
// anyway, and the host waited for its control to be drawn as it waits for any control a page has not
// drawn yet, then answered `target_not_found`, and only then did the absent-step skip pass it over
// (`../step-skip/absent-step.ts`). On local-classifieds that wait was 4.3 of the step's 5.1 seconds,
// on every replay (t893, `run-mwas477e-47e0c0b4` step 52).
//
// Waiting suits a step the Flow needs: the page may still be drawing what it will act on. It does not
// suit a step the Flow says is only sometimes there, because absence is an answer the page gives as it
// stands. So before such a step is dispatched, the host is asked once, with no wait, whether its control
// is shown (`fact-evaluation`, C9), the question a layer handler asks of the same press
// (`runtime/flow-authoring/bootstrap/layer-handlers/explored.ts`). A positive "not shown" becomes the
// step's readiness: judged, and not met. The step loop then does what it does for any readiness gate
// that did not hold: state routing decides on it, the Flow's declared way past the optional step is
// taken, and nothing is dispatched (`../graph-run.ts`, `./decision.ts`).
//
// **Only a positive answer passes the step over.** `true`, `unknown`, a host that cannot evaluate facts,
// a throw: each leaves the step to be dispatched and waited for exactly as before. So does a step whose
// control cannot be asked about -- one that is not optional, one with no parameters, one bound to a
// value the run does not hold. Its target is the step's own parameters, the durable target in the
// host's form that a fact's target is resolved to; Core never reads inside it.
//
// **Only an arrival's first attempt.** A retry follows an attempt that already answered, and a step
// that already answered `target_not_found` is passed over by the absent-step skip with no new question.
//
// A layer that opens a moment after the check is not lost: the step was passed over, and the layer is
// what the next step meets, which the host's interference handling and the Flow's layer handlers answer.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../components/automation/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { observeAutomationStudioFacts } from "../lifecycle-run/index.ts";
import { automationStudioOptionalStepWayOn } from "../step-skip/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../index.ts";

/** The words the readiness record carries: Core's own, never the page's. */
const NOT_SHOWN = "This step is only sometimes needed, and its control was not shown on the page, so it was passed over without waiting for it.";

/** Why no question was asked, or what the answer was: each case of the header, by name. */
export type AutomationStudioOptionalNotShownReading =
  | { kind: "not_shown"; readiness: NonNullable<AutomationStudioNodeAttemptTrace["readiness"]> }
  | { kind: "not_asked"; why: "not_optional" | "no_target" | "unbound_target" }
  | { kind: "asked"; truth: "true" | "unknown" };

export async function automationStudioOptionalStepNotShown(input: {
  flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">;
  node: AutomationStudioFlowNode;
  /** The run's values so far, which a step's bound parameters read. */
  values: Readonly<Record<string, JsonValue>>;
  options: Pick<AutomationStudioGraphExecutionOptions, "hostRuntime" | "signal" | "inputs" | "now">;
  attemptId: string;
}): Promise<AutomationStudioOptionalNotShownReading> {
  const { node, options } = input;
  if (!automationStudioOptionalStepWayOn(input.flow, node)) return { kind: "not_asked", why: "not_optional" };
  const authored = node.parameterValues;
  if (!authored || Object.keys(authored).length === 0) return { kind: "not_asked", why: "no_target" };
  const resolved = resolveAutomationNodeParameterValues(authored, { ...(options.inputs ?? {}), ...input.values });
  if (resolved.missingPaths.length) return { kind: "not_asked", why: "unbound_target" };
  const target: JsonObject = resolved.values;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const observed = await observeAutomationStudioFacts({
    hostRuntime: options.hostRuntime,
    groups: [{ key: "control", conditions: [{ fact: "visible", op: "visible", target }] }],
    context: { nodeId: node.id, attemptId: input.attemptId, ...(options.inputs ? { inputs: options.inputs } : {}), ...(options.signal ? { signal: options.signal } : {}) }
  });
  const truth = observed.results.get("control")?.[0]?.truth ?? "unknown";
  if (truth !== "false") return { kind: "asked", truth };
  return { kind: "not_shown", readiness: { ceilingMs: 0, waitedMs: Math.max(0, now() - startedAt), satisfied: false, checkedConditionCount: 1, message: NOT_SHOWN } };
}
