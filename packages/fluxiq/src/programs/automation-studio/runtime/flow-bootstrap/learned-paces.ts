// The paces this build's trials learned (P6, CC8, t799): what a submitted Flow
// needs so that its next trial starts a slowed-down step at the pace the site
// allows, without the model writing `repeat pace:` for it.
//
// A trial that met a site's "too fast" refusal, or closed its slow-down notice,
// raised the step's pace for the rest of that run (`../executor/pacing/`) and
// said so on the attempt (`pace.raisedToMs`). A passed trial the gate then holds
// back for not answering the slow-down (`./candidate/trial-slow-down.ts`) used to
// ask the model to write the pace. Core now writes it itself: `trial` keeps the
// pace each step was raised to, and `lower` sets it on the plan's matching step at
// the next submission.
//
// **A step is known by its identity, never by its key.** As a trial's toggle press
// is (`./script-statements/toggle-tie.ts`, t792), a learned pace belongs to the
// step written as the trial's node was: the same node definition and the same
// parameters, compared whole with Core's `ensureState` taken off. A step's key is
// its place in the script, which a repair renumbers; a step whose identity matches
// no recorded pace gets none, and a trial node the graph does not show is not
// recorded. Two steps written the same share the pace, as they share the control.
//
// The pace written is the recorded one rounded up to a whole 100 ms (so a time
// the model is told is always enough), held to
// `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS`, and never below a pace the step
// already carries. Recorded like the toggles, beside them, by the trial run
// (`../service/candidate-trial/run.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS, type AutomationStudioFlowBootstrapPlan } from "./plan/index.ts";

/** The trial's graph, as far as its nodes' written parameters go (as `./explored-toggles.ts` reads it). */
type TrialGraph = { readonly nodes: readonly { readonly id: string; readonly parameterValues?: JsonObject | undefined }[] };

/** One step a trial slowed down, by its identity, and the pace it was raised to (header). */
export type AutomationStudioExploredPace = {
  /** The node definition the step runs. */
  definitionId: string;
  /** The parameters the trial node ran with, `ensureState` taken off. */
  parameters: JsonObject;
  /** The most the trial raised its pace to, in milliseconds. */
  paceMs: number;
};

/** The most identities kept; the oldest goes first. */
const MAX_RECORDS = 128;
/** The longest parameters kept as a step's identity, as JSON; longer, the step is not recorded. */
const MAX_PARAMETERS_CHARS = 16_384;
/** The parameter Core gives a toggle step, never part of a step's identity. */
const ENSURE_STATE = "ensureState";
/** A pace is written in whole steps of this many milliseconds. */
const STEP_MS = 100;
const MADE = new WeakMap<object, AutomationStudioLearnedPaces>();

/** Every step a trial slowed down, with the pace it was raised to (header). */
export class AutomationStudioLearnedPaces {
  private readonly records: AutomationStudioExploredPace[] = [];

  /** The build's one record: the environment's own when it carries one, else one kept for that environment, so every brief and trial of a project build tell and read the same. */
  static of(environment: object & { readonly exploredPaces?: unknown }): AutomationStudioLearnedPaces {
    const shared = environment.exploredPaces;
    if (shared instanceof AutomationStudioLearnedPaces) return shared;
    const known = MADE.get(environment);
    if (known) return known;
    const made = new AutomationStudioLearnedPaces();
    MADE.set(environment, made);
    return made;
  }

  /** Records each attempt of a trial whose step had its pace raised, with its node's parameters from `graph` (header); a step met again keeps the largest pace. */
  trial(attempts: readonly AutomationStudioNodeAttemptTrace[], graph?: TrialGraph | undefined): void {
    const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node] as const));
    for (const attempt of attempts) {
      const raised = attempt.pace?.raisedToMs;
      if (raised === undefined || !Number.isFinite(raised) || raised <= 0) continue;
      const node = nodes.get(attempt.nodeId);
      if (!node) continue;
      const parameters = own(node.parameterValues);
      if (JSON.stringify(parameters).length > MAX_PARAMETERS_CHARS) continue;
      const identity = canonical(parameters);
      const known = this.records.find((record) => record.definitionId === attempt.definitionId && canonical(record.parameters) === identity);
      if (known) {
        known.paceMs = Math.max(known.paceMs, raised);
        continue;
      }
      this.records.push({ definitionId: attempt.definitionId, parameters: structuredClone(parameters), paceMs: raised });
      if (this.records.length > MAX_RECORDS) this.records.shift();
    }
  }

  /** Every recorded step, oldest first, each its own copy. */
  list(): AutomationStudioExploredPace[] {
    return structuredClone(this.records);
  }

  /**
   * `plan` with the pace of each step whose identity was recorded set on it (header);
   * `plan` itself, the same object, when no step needs a change.
   */
  lower(plan: AutomationStudioFlowBootstrapPlan): AutomationStudioFlowBootstrapPlan {
    if (!this.records.length) return plan;
    const wanted = new Map(this.records.map((record) => [`${record.definitionId}\n${canonical(record.parameters)}`, written(record.paceMs)] as const));
    let lowered: AutomationStudioFlowBootstrapPlan | undefined;
    for (const [subflowIndex, subflow] of plan.subflows.entries()) {
      for (const [nodeIndex, node] of subflow.nodes.entries()) {
        const paceMs = wanted.get(`${node.definitionId}\n${canonical(own(node.parameters))}`);
        if (paceMs === undefined || (node.paceMs ?? 0) >= paceMs) continue;
        lowered ??= structuredClone(plan);
        lowered.subflows[subflowIndex]!.nodes[nodeIndex]!.paceMs = paceMs;
      }
    }
    return lowered ?? plan;
  }
}

/** A pace as the plan holds it: whole steps of 100 ms, rounded up, within the plan's limits (header). */
function written(paceMs: number): number {
  const { minPaceMs, maxPaceMs } = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS;
  return Math.min(maxPaceMs, Math.max(minPaceMs, Math.ceil(paceMs / STEP_MS) * STEP_MS));
}

/** A step's parameters as its identity: a copy without Core's `ensureState` (header). */
function own(parameters: JsonObject | undefined): JsonObject {
  if (!parameters) return {};
  const { [ENSURE_STATE]: _core, ...rest } = parameters;
  return rest;
}

/** A JSON value written with its keys in order, so two of the same value compare equal. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
