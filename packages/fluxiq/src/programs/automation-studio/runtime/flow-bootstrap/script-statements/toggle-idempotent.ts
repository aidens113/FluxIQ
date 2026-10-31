// A step that flips a control between two states is safe to run again (t775).
//
// Builds stop putting the site back before a trial (user, 2026-10-27), so the
// Flow under test, and every later run, may meet a site already in the state a
// step asks for. A plain press of a control that switches between two states
// then flips it back. Only the domain can tell such a control, so it said so
// when the build pressed it while exploring (`../explored-toggles.ts`), with a
// `signature` of the state the press left, and, where its library has a node
// that sets the asked state itself, that node's id (`idempotentWith`).
//
// A submitted step is tied to an explored press when it runs the same node,
// declares exactly `modify_existing`, and names the same control: a handle it
// was resolved from (`handleViews`) that the press named, or the same resolved
// target, compared whole and never read inside (`./toggle-tie.ts`). The
// earliest such press decides (t792): the build's first press moved the
// control away from where the site was before the build, and a later press
// that disagrees with it is a reversal, whose signature names the build's
// before-state, never the asked state. Run `run-mvswfjbq-d0a95f6e` re-pressed a
// control it had flipped while exploring, the newest press decided, and the
// step was taught backwards: its trial pressed nothing, "already in the asked
// state", on a control that was not.
//
// - the step's node declares `ensureState`: Core gives it the press's
//   signature as `ensureState`, and the domain presses only where the page is
//   not already so. A loop's step carries it on its node, so every pass is held
//   to it. This is the step's idempotent form whether or not the press named
//   `idempotentWith` (t799): a node that takes the asked state is already the
//   press that sets it, so a model round trip to rewrite it is not needed;
// - its node does not, and the press named `idempotentWith`: the step is refused
//   `candidate.toggle_not_idempotent`, at its own place, saying to write it with
//   that node set to the asked state. Core does not rewrite the step to that
//   node itself: what to set it to is inside the signature and in the other
//   node's own parameters, both the domain's, which Core never reads or names;
// - neither: a plain press, as before.
//
// **A look that showed a stateful control ties the step too (CC9, t799).** A
// handle's view may say its control is stateful and which signature a press of
// it leaves (`control.ensures`, `../../llm/harness-options/binding.ts`). A step
// resolved from such a handle whose node takes `ensureState` is given it,
// though the build never pressed it. It is the lowest tie: an explored or a
// trial press decides first, since a press is what the control did, a look only
// what it showed. The step's own views decide only when they agree: views of
// one step naming two different signatures tie nothing. A look never refuses: it
// is not evidence that the step's node flips the control, so a node that cannot
// take `ensureState` stays the plain press it was.
//
// Only a node whose definition declares `ensureState` is given it. A plan is
// validated again before it runs (`../verification/detached-execution.ts`),
// and validation resolves a key the node does not declare to the nearest one
// it does (`../plan/name-correction.ts`): an undeclared `ensureState` became the
// press's `expectedState`, and the trial flipped the control back (t775-P, the
// photo-social like loop). A node that cannot take it stays a plain press.
//
// A step is also tied to a toggle a trial pass made (t787) on the step written
// as that trial's node was: the press records `trialNodes`, the executed ids of
// the trial nodes the domain answered as a toggle, and `trialParameters`, the
// parameters that node ran with, and a step of the same node written with the
// same parameters is that step whatever its key (t792, `./toggle-tie.ts`). Its
// key is its place in the script, which a repair that inserts or removes an
// earlier step renumbers, so the key decides only between two steps written the
// same. A looped step whose handle was never pressed while exploring then
// carries `ensureState` from the revision after its first trial.
//
// The model never writes `ensureState`: one it wrote is taken off first. Pure;
// returns a new plan.

import { isDeepStrictEqual } from "node:util";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioPlanControlState } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioExploredToggleTie } from "./toggle-tie.ts";

/** One explored press the domain answered as a toggle (`../explored-toggles.ts`). */
export type AutomationStudioExploredToggle = {
  callId?: string;
  /** The node the press ran. */
  node: string;
  /** The handles its `target` named, as the model wrote them. */
  handles: readonly string[];
  /** Its `target` as the domain resolved it; opaque. */
  target?: JsonValue;
  /**
   * The executed ids of the trial nodes that made this toggle in a trial pass
   * (t787): a step whose own node is one of them is tied to it though its handle
   * was never pressed while exploring. Absent for a press made while exploring.
   */
  trialNodes?: readonly string[];
  /**
   * The parameters the trial node ran with, Core's `ensureState` taken off
   * (t792): the step's identity, by which a later revision's step is tied to
   * this press whatever its key (`./toggle-tie.ts`). Absent for a press made
   * while exploring, and for a trial press whose node the trial's graph did not
   * show, which then ties no step.
   */
  trialParameters?: JsonObject;
  /** The domain's opaque word for the state the press left. */
  signature: JsonObject;
  /** The library node that sets the asked state itself, where the domain has one. */
  idempotentWith?: string;
};

/** The code a step is refused under when the domain has a node that sets the state (header). */
const NOT_IDEMPOTENT = "candidate.toggle_not_idempotent";
/** The parameter Core gives a toggle step, and the model never writes (header). */
const ENSURE_STATE = "ensureState";

/** The plan with each toggle step given its `ensureState`, and each step refused for a node that sets the state (header). */
export function automationStudioFlowPlanToggleSteps(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  /** Which handle each node was resolved from, the node named `<subflow key>.<node key>`, and what its view showed of a stateful control (header, CC9). */
  handleViews?: readonly { node: string; handle: string; control?: AutomationStudioPlanControlState | undefined }[] | undefined;
  explored: readonly AutomationStudioExploredToggle[];
  /** Whether a node's definition declares `ensureState` (header); absent, every node is taken to. */
  takesEnsureState?: ((definitionId: string) => boolean) | undefined;
}): { plan: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  const plan = structuredClone(input.plan);
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      if (node.parameters && ENSURE_STATE in node.parameters) {
        const { [ENSURE_STATE]: _written, ...rest } = node.parameters;
        node.parameters = rest;
      }
      if (node.consequences?.length !== 1 || node.consequences[0] !== "modify_existing") continue;
      const ref = `${subflow.key}.${node.key}`;
      const views = (input.handleViews ?? []).filter((view) => view.node === ref);
      const handles = new Set(views.map((view) => view.handle));
      // The earliest tied press, never a later reversal; a trial's press by the step's identity, never its key (header, t792).
      const others = plan.subflows.flatMap((each) => each.nodes.filter((other) => other !== node));
      const press = automationStudioExploredToggleTie({ node: node.definitionId, handles, target: node.parameters?.target, step: { ref, parameters: node.parameters, others } }, input.explored);
      // A look at a stateful control ties last, and only where the step's node takes the state (header, CC9).
      const takes = input.takesEnsureState?.(node.definitionId) !== false;
      const signature = press?.signature ?? (takes ? lookedState(views) : undefined);
      if (!signature) continue;
      if (takes) {
        node.parameters = { ...node.parameters, [ENSURE_STATE]: structuredClone(signature) };
        continue;
      }
      // A node that cannot take the state, where the domain has one that sets it: refused, never rewritten (header).
      if (press?.idempotentWith && press.idempotentWith !== node.definitionId) {
        issues.push({ severity: "error", code: NOT_IDEMPOTENT, message: refusal(press.idempotentWith), path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}` });
      }
    }
  }
  return { plan, issues };
}

/** The signature the step's own views say a press of its stateful control leaves, when they name exactly one (header, CC9). */
function lookedState(views: readonly { control?: AutomationStudioPlanControlState | undefined }[]): JsonObject | undefined {
  const named = views.flatMap((view) => view.control?.stateful === true && view.control.ensures ? [view.control.ensures] : []);
  return named.length && named.every((ensures) => isDeepStrictEqual(ensures, named[0])) ? named[0] : undefined;
}

/** Core's sentence for a toggle step written as a plain press, naming only the node to use (header). */
function refusal(node: string): string {
  return "This step presses a control that switches between two states: pressing it while exploring changed which state it shows. "
    + "A run that meets the site already in the state the step asks for would press it and flip it back. "
    + `Write this step with node ${node} instead, set to the state the step should leave, so it changes the control only when it is not already so.`;
}
