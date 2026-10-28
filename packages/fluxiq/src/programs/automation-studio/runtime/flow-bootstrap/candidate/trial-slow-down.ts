// A passed trial the site asked to slow down, and whether the Flow answers it
// yet (t485; the rule is in `./trial-gate.ts`'s header, "A yes the site asked
// to slow down completes only once the Flow answers it"). Moved out of the
// trial gate whole (t769) so the gate keeps its line budget; the gate still
// owns when a slow-down is read and what it refuses.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../plan/index.ts";
import type { AutomationStudioFlowCandidate } from "./contracts.ts";

/** The nodes a Flow answers a slow-down with (header): a wait, and the join an optional step's way past meets at. */
const WAIT_NODE_ID = "builtin.timing.wait";
const MERGE_NODE_ID = "builtin.control.merge";

/** What the model is told when a passed trial met a slow-down the Flow does not answer yet (header). */
function instruction(unhandled: readonly JsonObject[]): string {
  const said = unhandled.map((entry) => {
    const needs: string[] = [];
    if (typeof entry.paceAtLeastMs === "number") needs.push(`\`repeat pace:\` of at least ${seconds(entry.paceAtLeastMs)} on the first step of the span it repeats in`);
    if (typeof entry.wayOut === "string" && typeof entry.waitAtLeastMs === "number") {
      needs.push(`right after it, inside the span, an \`optional: yes\` step that presses ${entry.wayOut}, and directly after that a \`builtin.timing.wait\` step with \`only after:\` naming it that waits at least ${seconds(entry.waitAtLeastMs)}, so a pass that meets the notice dismisses it, waits and goes on with the loop (or one handler covering the step that does the same)`);
    }
    const label = typeof entry.label === "string" ? ` (${JSON.stringify(entry.label)})` : "";
    return `${typeof entry.step === "number" ? `Step ${entry.step}` : "A step"}${label} needs ${needs.join(", and ")}.`;
  });
  return `The trial passed, but the site asked the run to slow down, and this Flow does not answer that itself yet, so this revision cannot complete. ${said.join(" ")} Change the Flow, submit the whole candidate, then test the new revision, and complete only after a yes for it.`;
}

/** One step a trial listed, with the paces the run learned for it; a learned pace whose step is not listed stands alone. */
type SteppedPaces = JsonObject & { learned: JsonObject[] };

/**
 * Each step of a passed trial the site asked to slow down that the Flow does
 * not answer yet (header): its number and label, `paceAtLeastMs` when no
 * node's pace reaches the one asked, and `wayOut` with `waitAtLeastMs` when the
 * notice's way out was named and the Flow holds neither a wait after an
 * optional step nor a handler.
 */
function unhandled(feedback: JsonObject, candidate: AutomationStudioFlowCandidate): JsonObject[] {
  const steps = objects(feedback.steps);
  const paces = objects(feedback.paces);
  const metSlowDown = paces.length > 0 || steps.some((step) => objects(step.absorbed).some((entry) => positive(entry.askedWaitMs)) || objects(step.interruptions).some((layer) => layer.kind === "rate_limit"));
  // A trial that met none is a plain yes, and its plan is not read.
  if (!metSlowDown) return [];
  const subflows = candidate.buildPlan.plan.subflows;
  const longestPace = Math.max(0, ...subflows.flatMap((subflow) => subflow.nodes.map((node) => node.paceMs ?? 0)));
  const dismissesAndWaits = subflows.some((subflow) => waitAfterOptional(subflow) || subflow.nodes.some((node) => node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler));
  const sameStep = (pace: JsonObject, step: JsonObject) => pace.definitionId === step.definitionId && pace.label === step.label && pace.control === step.control;
  const listed: SteppedPaces[] = steps.map((step) => ({ ...step, learned: paces.filter((pace) => sameStep(pace, step)) }));
  const alone: SteppedPaces[] = paces.filter((pace) => !steps.some((step) => sameStep(pace, step))).map((pace) => ({ ...(typeof pace.label === "string" ? { label: pace.label } : {}), learned: [pace] }));
  return [...listed, ...alone].flatMap((step): JsonObject[] => {
    const asked = objects(step.absorbed).map((entry) => entry.askedWaitMs).filter(positive);
    const learned = step.learned.map((pace) => pace.paceMs).filter(positive);
    const wayOut = objects(step.interruptions).filter((layer) => layer.kind === "rate_limit").map((layer) => layer.wayOut).find((handle): handle is string => typeof handle === "string" && handle !== "");
    const paceAtLeastMs = Math.max(0, ...(learned.length ? learned : asked));
    const needsPace = paceAtLeastMs > 0 && longestPace < Math.floor(paceAtLeastMs / 100) * 100;
    const needsBranch = wayOut !== undefined && !dismissesAndWaits;
    if (!needsPace && !needsBranch) return [];
    const waitAtLeastMs = Math.max(0, ...asked) || paceAtLeastMs;
    return [{
      ...(typeof step.step === "number" ? { step: step.step } : {}),
      ...(typeof step.label === "string" ? { label: step.label } : {}),
      ...(needsPace ? { paceAtLeastMs } : {}),
      ...(needsBranch ? { wayOut, waitAtLeastMs } : {})
    }];
  });
}

/** Whether a subflow holds a wait run only after an optional step: one that follows a step whose way past joins the pass again. */
function waitAfterOptional(subflow: AutomationStudioFlowCandidate["buildPlan"]["plan"]["subflows"][number]): boolean {
  const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
  const optional = new Set(subflow.edges.filter((edge) => edge.source.portId === "failed" && byKey.get(edge.target.nodeKey)?.definitionId === MERGE_NODE_ID).map((edge) => edge.source.nodeKey));
  return subflow.edges.some((edge) => optional.has(edge.source.nodeKey) && edge.source.portId !== "failed" && byKey.get(edge.target.nodeKey)?.definitionId === WAIT_NODE_ID);
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { return JSON.stringify(value) !== undefined; } catch { return false; }
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** A wait as the model reads it, in seconds rounded up to a tenth, so writing the number said is always enough. */
function seconds(ms: number): string {
  return `${(Math.ceil(ms / 100) / 10).toFixed(1)} s`;
}

/** A passed trial's unanswered slow-downs and what the model is told of them (header). */
export const automationStudioCandidateTrialSlowDown = Object.freeze({ unhandled, instruction });
