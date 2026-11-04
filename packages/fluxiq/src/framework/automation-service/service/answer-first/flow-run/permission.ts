// Permission for a Flow, once, before it runs (plan D13: never in the middle of a Flow).
//
// **Where a question can come from on this path.** An engine run reaches no permission gate of its
// own: `permittedConsequences` is no executor option (`../../runtime-session/graph-options.ts`), and
// `authorizedDomainIds` is only which domains' published Flows a global Flow may call
// (`../../../composite-execution/owner.ts`). A step's lasting consequence is checked when its Flow
// is authored. So this is that check, through the attempt's own gate (`planStep`), and a run is
// given no parking port, so a step that does raise a question ends the run and asks nobody.
//
// **Each declaration goes as the domain made it**, with its control's words and verb. A step whose
// domain put none to the check still has the classes the Flow declares on its node, and those are
// asked about too, in Core's plain words. Only moving money, deleting and sending or publishing
// reach a person (`../../../../../runtime/action-permission-requests/destructive.ts`), and a grant
// holds for the attempt, so a repeat over a hundred rows asks once.
//
// **Naming the control.** The gate names a control only when the attempt has shown it the name, and
// a saved Flow's run asks before showing anything. So before each step's declarations go to the
// check, the step's own recorded words (the control it acted on) are given to the gate to show
// (`shown`, screened by `./control-words.ts`). That is display only: the same declarations are put in the same order,
// and a step with no usable words is asked in the same plain words as before.

import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioFlowBootstrapNode } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstFlowRunControlWords } from "./control-words.ts";
import type { AutomationStudioAnswerFirstFlowRunAssembly } from "./assemble.ts";
import type { AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";

/** What the words stand for when a step gives a person no name for itself. */
const UNNAMED_STEP = "a saved step of this task";
const PLAIN_VERB = "run";

/** The classes refused, or `undefined` when the Flow may run. */
export async function automationStudioAnswerFirstFlowRunPermission(ports: Pick<AutomationStudioAnswerFirstFlowRunPorts, "permissions">, assembly: Extract<AutomationStudioAnswerFirstFlowRunAssembly, { ok: true }>, saved: readonly AutomationStudioFlowDraftStep[] = []): Promise<readonly string[] | undefined> {
  for (const [subflowIndex, subflow] of assembly.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const ref = `${subflow.key}.${node.key}`;
      const place = assembly.locator?.nodes[`${subflowIndex}.${nodeIndex}`];
      const step = place?.draftStepId !== undefined ? saved.find((candidate) => candidate.id === place.draftStepId) : place?.draftStep !== undefined ? saved.find((candidate) => candidate.position === place.draftStep) : undefined;
      if (step) ports.permissions.shown?.(automationStudioAnswerFirstFlowRunControlWords(step));
      const check = ports.permissions.planStep({ definitionId: node.definitionId, ref });
      for (const declaration of declarationsOf(node, assembly.declared.get(ref))) {
        const verdict = await check(declaration);
        if (!verdict.permitted) return verdict.missing.length ? [...verdict.missing] : [...declaration.consequences];
      }
    }
  }
  return undefined;
}

function declarationsOf(node: AutomationStudioFlowBootstrapNode, declared: readonly AutomationStudioActionDeclaration[] | undefined): readonly AutomationStudioActionDeclaration[] {
  if (declared?.length) return declared;
  const consequences = (node.consequences ?? []) as readonly AutomationStudioActionConsequence[];
  return consequences.length ? [{ consequences, control: { name: node.label ?? UNNAMED_STEP }, verb: PLAIN_VERB }] : [];
}
