// Tied observations name the states a step can choose. The model explicitly
// selects the instruction's end-state with ensureState; Core grounds it in the
// step's own bounded evidence and passes back the exact stored signature.
// Matching remains in toggle-tie.ts. No press order or wording supplies intent.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioPlanControlState } from "../../llm/harness-options/index.ts";
import { automationStudioToggleStateChoice } from "../../toggle-state/index.ts";
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
  /** The actual observed pre-state, when the domain supplied it; never inferred. */
  beforeSignature?: JsonObject;
  /** The library node that sets the asked state itself, where the domain has one. */
  idempotentWith?: string;
};

/** Grounds every known modify_existing toggle step in its explicit observed end-state. Pure. */
export function automationStudioFlowPlanToggleSteps(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  handleViews?: readonly { node: string; handle: string; control?: AutomationStudioPlanControlState | undefined }[] | undefined;
  explored: readonly AutomationStudioExploredToggle[];
  takesEnsureState?: ((definitionId: string) => boolean) | undefined;
}): { plan: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  const plan = structuredClone(input.plan);
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      // Read the submitted choice before stripping it from the working plan.
      const parameters = node.parameters;
      if (parameters && "ensureState" in parameters) {
        const { ensureState: _selected, ...rest } = parameters;
        node.parameters = rest;
      }
      if (node.consequences?.length !== 1 || node.consequences[0] !== "modify_existing") continue;
      const ref = `${subflow.key}.${node.key}`;
      const views = (input.handleViews ?? []).filter((view) => view.node === ref);
      const others = plan.subflows.flatMap((each) => each.nodes.filter((other) => other !== node));
      const presses = automationStudioExploredToggleTie({ node: node.definitionId, handles: new Set(views.map((view) => view.handle)), target: node.parameters?.target, step: { ref, parameters: node.parameters, others } }, input.explored);
      const path = `plan.subflows.${subflowIndex}.nodes.${nodeIndex}`;
      if (input.takesEnsureState?.(node.definitionId) === false) {
        // A stateful target does not prove this node toggles it: an explicit
        // setter has its own parameters. Preserve the established unsupported
        // path; only the node's own press evidence can require another node.
        const alternatives = [...new Set(presses.flatMap((press) => press.idempotentWith && press.idempotentWith !== node.definitionId ? [press.idempotentWith] : []))];
        if (alternatives.length) issues.push({ severity: "error", code: "candidate.toggle_not_idempotent", message: `This step presses a control that switches between states, but its node cannot take ensureState. Write this step with node ${alternatives.join(" or ")} instead, set to the state the instruction asks to leave.`, path });
        continue;
      }
      const choice = automationStudioToggleStateChoice({ parameters, explored: presses, controls: views.map((view) => view.control) });
      if (choice.kind === "unknown") continue;
      if (choice.kind === "refused") {
        issues.push({ severity: "error", code: choice.code, message: choice.message, path });
      } else node.parameters = { ...node.parameters, ensureState: choice.signature };
    }
  }
  return { plan, issues };
}
