// The saved steps made into a Flow by the check a draft goes through (`../attempt/draft-save.ts`),
// against the binding as it stands now: the steps are the source of truth, not a stored plan.
//
// **Nobody is asked here, and what each step declares is kept.** The domain, which alone knows the
// control and the verb, puts each step's declaration to the check handed to it as it resolves the
// step. That check grants, as a draft's does, so a person is never asked about a Flow that then
// cannot be assembled. What it was told is asked once the Flow stands (`./permission.ts`).

import type { AutomationStudioActionDeclaration } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";

export type AutomationStudioAnswerFirstFlowRunAssembly =
  | { ok: false; codes: readonly string[] }
  | {
    ok: true;
    buildPlan: AutomationStudioFlowBuildPlan;
    /** Where each plan node was written from (`assemble-draft.ts`, `draftLocator`). */
    locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
    /** What the domain declared for each step, by `<subflow key>.<node key>`. */
    declared: ReadonlyMap<string, readonly AutomationStudioActionDeclaration[]>;
  };

/** The check asks a summary of a completed result; nothing reads it here. */
const SUMMARY = "The saved steps of this task.";

export async function automationStudioAnswerFirstFlowRunAssemble(ports: Pick<AutomationStudioAnswerFirstFlowRunPorts, "input">, steps: readonly AutomationStudioFlowDraftStep[]): Promise<AutomationStudioAnswerFirstFlowRunAssembly> {
  const { input } = ports;
  const declared = new Map<string, AutomationStudioActionDeclaration[]>();
  try {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: SUMMARY }, projectId: input.projectId, flowId: input.flowId, registry: input.registry, resolution: input.resolution, size: input.size, binding: input.binding,
      permissionFor: ({ ref }) => async (declaration) => {
        declared.set(ref, [...(declared.get(ref) ?? []), declaration]);
        return { permitted: true, missing: [], requestId: null };
      },
      draftSteps: steps, routeSignaturesOf: input.routing.signaturesOf, instructionText: input.instructionText,
      ...(input.startLocation === undefined ? {} : { startLocation: input.startLocation })
    });
    if (!verdict.ok) return { ok: false, codes: verdict.codes };
    return { ok: true, buildPlan: verdict.buildPlan, locator: verdict.locator, declared };
  } catch (error) {
    // Only the error's kind: its words may quote a value.
    return { ok: false, codes: [error instanceof Error && error.name ? error.name : "unknown"] };
  }
}
