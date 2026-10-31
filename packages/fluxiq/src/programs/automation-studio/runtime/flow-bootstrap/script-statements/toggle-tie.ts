// Which press of a toggle a step or a call on the same control is held to (t775, t792).
//
// A press the domain answered as a toggle (`../explored-toggles.ts`) ties a
// later step or exploration call when it ran the same node and named the same
// control: a handle the later one was written with that the press named, or the
// same resolved target, compared whole and never read inside.
//
// **A trial's press ties a step by the step's identity, never by its place
// (t792).** A press a trial pass made (`trialNodes`, t787) ties only a plan's
// step (never an exploration call), and only the step written as the trial's
// node was: the same node and the same parameters, compared whole with Core's
// own `ensureState` taken off (`trialParameters`). That is how Core already
// knows a step across revisions: a step "as the revision that ran wrote it" is
// its parameters (`../../result-verification/standing-no/written-conditions.ts`,
// t666), and a step's label is display words, which Core's same-behaviour rule
// sets aside (`../candidate/unchanged-submission.ts`). The web domain drops a
// resolved `target` and writes the control it names into other parameters, so
// `target` alone names no control there. The step's key, `s10`, is its place
// in the script: a repair that inserts or removes an earlier step renumbers
// every later one, and a tie by key held a step to another control's state, so
// it skipped or pressed by that state. Only where two steps of the plan are
// written the same (their identity is genuinely one) does the place decide
// between them: the one whose `<subflow key>.<node key>` the trial node's id
// ends with. A step whose identity matches no trial press gets none of them.
//
// **A control named in its other state is the same control (t792).** A
// toggle's own words change with its state ("Like" and "Unlike"), so a repair
// that looked after the trial's press writes the step with the other state's
// words. Where the parameters differ only by the words this press's own
// signature gained and lost, the step is the trial's step
// (`./toggle-state-words.ts`), but only when no other step of the plan on the
// same node matches the press at all: a plan that presses the control and then
// presses it back (an undo, written with the other state's words) ties the
// press to the step written exactly as the trial's was, never to the undo.
//
// Every tied observation is returned. Matching identifies a step; it cannot
// identify task intent. State choice belongs to `runtime/toggle-state/`.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioExploredToggle } from "./toggle-idempotent.ts";
import { automationStudioToggleSameAcrossStates } from "./toggle-state-words.ts";

/** The parameter Core gives a toggle step (`./toggle-idempotent.ts`): never part of what the step is. */
const ENSURE_STATE = "ensureState";

/** Every recorded press tied to the step or call, without choosing its state. */
export function automationStudioExploredToggleTie(
  tie: {
    /** The node the step or call runs. */
    node: string;
    /** The handles it was written with. */
    handles: ReadonlySet<string>;
    /** Its `target`, written or resolved; compared whole. */
    target?: JsonValue | undefined;
    /**
     * A plan's step (header): its name `<subflow key>.<node key>`, its
     * parameters as resolved, and every other step of its plan, so a trial's
     * press is tied by identity and, between steps written the same, by place.
     * Absent for an exploration call, which no trial press ties.
     */
    step?: {
      ref: string;
      parameters?: JsonObject | undefined;
      others: readonly { definitionId: string; parameters?: JsonObject | undefined }[];
    } | undefined;
  },
  explored: readonly AutomationStudioExploredToggle[]
): AutomationStudioExploredToggle[] {
  const target = tie.target === undefined ? undefined : canonical(tie.target);
  const step = tie.step;
  const identity = step ? written(step.parameters) : undefined;
  const others = (step?.others ?? []).filter((other) => other.definitionId === tie.node);
  // Another step of the plan written the same: only then does the place decide (header).
  const twinned = others.some((other) => written(other.parameters) === identity);
  return explored.filter((press) => {
    if (press.node !== tie.node) return false;
    if (press.trialNodes?.length) {
      if (!step || press.trialParameters === undefined) return false;
      const match = matchOf(press, step.parameters);
      if (match === "exact") return !twinned || press.trialNodes.some((id) => id.endsWith(`.${step.ref}`));
      // Named in the control's other state: this step only when no other step matches the press at all (header).
      return match === "other_state" && others.every((other) => matchOf(press, other.parameters) === undefined);
    }
    return press.handles.some((handle) => tie.handles.has(handle))
      || (target !== undefined && press.target !== undefined && canonical(press.target) === target);
  });
}

/** How a step's parameters match a trial press's: written the same, the same up to its state's words, or not at all (header). */
function matchOf(press: AutomationStudioExploredToggle, parameters: JsonObject | undefined): "exact" | "other_state" | undefined {
  if (press.trialParameters === undefined) return undefined;
  if (written(press.trialParameters) === written(parameters)) return "exact";
  return automationStudioToggleSameAcrossStates(own(press.trialParameters), own(parameters), press.signature) ? "other_state" : undefined;
}

/** A step's parameters as its identity: `ensureState` taken off, keys in order (header). */
function written(parameters: JsonObject | undefined): string {
  return canonical(own(parameters));
}

/** A step's parameters without Core's `ensureState` (header). */
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
