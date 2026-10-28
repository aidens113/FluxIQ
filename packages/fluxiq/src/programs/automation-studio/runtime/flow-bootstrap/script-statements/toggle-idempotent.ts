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
// target, compared whole and never read inside. The newest such press decides:
//
// - it named `idempotentWith`: the step is refused
//   `candidate.toggle_not_idempotent`, at its own place, saying to write it with
//   that node set to the asked state;
// - otherwise Core gives the node the parameter `ensureState`, the press's
//   signature, and the domain presses only where the page is not already so.
//   A loop's step carries it on its node, so every pass is held to it.
//
// Only a node whose definition declares `ensureState` is given it. A plan is
// validated again before it runs (`../verification/detached-execution.ts`),
// and validation resolves a key the node does not declare to the nearest one
// it does (`../plan/name-correction.ts`): an undeclared `ensureState` became the
// press's `expectedState`, and the trial flipped the control back (t775-P, the
// photo-social like loop). A node that cannot take it stays a plain press.
//
// The model never writes `ensureState`: one it wrote is taken off first. Pure;
// returns a new plan.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";

/** One explored press the domain answered as a toggle (`../explored-toggles.ts`). */
export type AutomationStudioExploredToggle = {
  callId?: string;
  /** The node the press ran. */
  node: string;
  /** The handles its `target` named, as the model wrote them. */
  handles: readonly string[];
  /** Its `target` as the domain resolved it; opaque. */
  target?: JsonValue;
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
  /** Which handle each node was resolved from, the node named `<subflow key>.<node key>`. */
  handleViews?: readonly { node: string; handle: string }[] | undefined;
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
      const handles = new Set((input.handleViews ?? []).filter((view) => view.node === ref).map((view) => view.handle));
      const target = node.parameters?.target;
      const press = [...input.explored].reverse().find((explored) => explored.node === node.definitionId
        && (explored.handles.some((handle) => handles.has(handle)) || (target !== undefined && explored.target !== undefined && canonical(target) === canonical(explored.target))));
      if (!press) continue;
      if (press.idempotentWith) {
        issues.push({ severity: "error", code: NOT_IDEMPOTENT, message: refusal(press.idempotentWith), path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}` });
        continue;
      }
      if (input.takesEnsureState?.(node.definitionId) === false) continue;
      node.parameters = { ...node.parameters, [ENSURE_STATE]: structuredClone(press.signature) };
    }
  }
  return { plan, issues };
}

/** Core's sentence for a toggle step written as a plain press, naming only the node to use (header). */
function refusal(node: string): string {
  return "This step presses a control that switches between two states: pressing it while exploring changed which state it shows. "
    + "A run that meets the site already in the state the step asks for would press it and flip it back. "
    + `Write this step with node ${node} instead, set to the state the step should leave, so it changes the control only when it is not already so.`;
}

/** A JSON value written with its keys in order, so two of the same value compare equal. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
