// A run's traced attempts, as trail steps (`../trail.ts`): the engine's own record of each step it ran, in run order,
// for the check of a finished run (`../../result-summary.ts`, `../../verify.ts`) and for a saved Flow's run inside an
// attempt (`SVC/answer-first/flow-run/flow-run.ts`, t963), whose result the completion judge then judges.
//
// `did` is the step's node definition (the attempt's own, else its node's), else its node id, and `on` its label;
// `asked` what it was asked to do: its node's parameters, else, for a step with none, what the run handed it (`inputs`); `outcome` how the attempt ended (its status, its route or why it was passed
// over, and its failure's code where it failed); `found` what it answered (`outputs`, and the engine's `message`),
// what it changed on the page it stayed on (the domain's `added` and `removed` view lines) and the domain's view after
// it, by the domain's declared view keys. A step that ran a child Flow is followed by that Flow's own steps, in order.
// Whole: nothing is cut (`../../step-changes.ts` says what the diff lines are).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";

/** One traced attempt, as far as this reads it. */
type TracedAttempt = {
  nodeId: string;
  definitionId?: string | undefined;
  route?: string | undefined;
  status?: string | undefined;
  inputs?: Readonly<Record<string, unknown>> | undefined;
  outputs?: Readonly<Record<string, unknown>> | undefined;
  message?: string | undefined;
  failure?: { code?: string | undefined } | undefined;
  skipped?: unknown;
  childTrace?: { attempts?: readonly TracedAttempt[] | undefined } | undefined;
  stateRefs?: { stateDiff?: JsonObject; afterAction?: { summary?: JsonObject | undefined } } | undefined;
};

/** A node of the Flow, as far as this reads it. */
type Node = { id: string; definitionId?: string | undefined; label?: string | undefined; parameterValues?: JsonObject | undefined };

export function automationStudioResultTrailOfAttempts(attempts: readonly TracedAttempt[] | undefined, nodes: readonly Node[], viewKeys: readonly string[] | undefined): AutomationStudioResultTrailStep[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keys = (viewKeys ?? []).filter((key) => !key.includes("."));
  const steps: AutomationStudioResultTrailStep[] = [];
  const walk = (list: readonly TracedAttempt[] | undefined): void => {
    for (const attempt of list ?? []) {
      steps.push(stepOf(attempt, byId.get(attempt.nodeId), keys));
      walk(attempt.childTrace?.attempts);
    }
  };
  walk(attempts);
  return steps;
}

function stepOf(attempt: TracedAttempt, node: Node | undefined, keys: readonly string[]): AutomationStudioResultTrailStep {
  const failed = attempt.failure?.code;
  const parameters = node?.parameterValues && Object.keys(node.parameterValues).length ? node.parameterValues : undefined;
  const asked = parameters ?? (attempt.inputs && Object.keys(attempt.inputs).length ? (attempt.inputs as JsonValue) : undefined);
  const outcome = [attempt.status, attempt.route ? `route ${attempt.route}` : undefined, attempt.skipped !== undefined && attempt.skipped !== false ? "passed over" : undefined, failed ? `failure ${failed}` : undefined]
    .filter((part): part is string => typeof part === "string" && part.length > 0).join(", ");
  const diff = attempt.stateRefs?.stateDiff;
  const changed = diff ? Object.fromEntries((["added", "removed"] as const).flatMap((key) => (typeof diff[key] === "string" && (diff[key] as string).trim() ? [[key, diff[key]!]] : []))) : {};
  const after = attempt.stateRefs?.afterAction?.summary;
  const view = after ? Object.fromEntries(keys.filter((key) => Object.hasOwn(after, key)).map((key) => [key, after[key]!])) : {};
  const found: JsonObject = {
    ...(attempt.outputs && Object.keys(attempt.outputs).length ? { outputs: attempt.outputs as JsonValue } : {}),
    ...(attempt.message?.trim() ? { message: attempt.message.trim() } : {}),
    ...(Object.keys(changed).length ? { changed } : {}),
    ...(Object.keys(view).length ? { view } : {})
  };
  return {
    did: attempt.definitionId ?? node?.definitionId ?? attempt.nodeId,
    ...(node?.label ? { on: node.label } : {}),
    ...(asked ? { asked } : {}),
    ...(outcome ? { outcome } : {}),
    ...(Object.keys(found).length ? { found } : {})
  };
}
