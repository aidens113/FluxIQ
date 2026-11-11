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
  | {
    ok: false;
    codes: readonly string[];
    /** Each issue's code and where it is, for a step log. */
    issues?: readonly string[];
    /** What a model repairing the steps may be told of each issue: its code, the step it is at, and Core's own sentence where that quotes nothing written (`TOLD`). */
    told?: readonly { code: string; step?: number; said?: string }[];
  }
  | {
    ok: true;
    buildPlan: AutomationStudioFlowBuildPlan;
    /** Where each plan node was written from (`assemble-draft.ts`, `draftLocator`). */
    locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
    /** What the domain declared for each step, by `<subflow key>.<node key>`. */
    declared: ReadonlyMap<string, readonly AutomationStudioActionDeclaration[]>;
  };

/**
 * The issues of a draft's assembly whose sentence is Core's own and quotes only step numbers, node
 * ids and Core's words, so it may go to the model that repairs the steps
 * (`runtime/flow-authoring/bootstrap/authoring/`: `draft-routing.ts`, `assemble-draft.ts`,
 * `draft-bindings.ts`). Left out, so told by code and step alone, are the ones that quote what was
 * written into a step: a test value (`input_conflict`), a row field, an input or an output name.
 */
const TOLD: ReadonlySet<string> = new Set([
  "flow_draft.no_steps",
  "flow_draft.step_not_written",
  "flow_draft.routing_unavailable",
  "flow_draft.check_not_before_step",
  "flow_draft.recovery_behind_step",
  "flow_draft.recovery_is_routed",
  "flow_draft.repeat_span_unknown",
  "flow_draft.repeat_not_after_its_source",
  "flow_draft.repeat_body_is_routed",
  "flow_draft.repeat_while_never_ends",
  "flow_draft.step_binding_source_missing",
  "flow_draft.step_binding_not_earlier",
  "flow_draft.step_binding_conditional_source",
  "flow_draft.step_binding_repeated_source",
  "flow_draft.row_binding_outside_loop",
  "flow_draft.loop_unbounded"
]);

/** The step an issue's path names (`draft.steps.<position>`). */
const STEP_PATH = /^draft\.steps\.(\d+)(?:\.|$)/u;

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
    // What each issue is and where; its words only where they are Core's own and quote no value (`TOLD`).
    if (!verdict.ok) return { ok: false, codes: verdict.codes, issues: verdict.issues.map((issue) => `${issue.code} at ${issue.path}`), told: verdict.issues.filter((issue) => issue.severity === "error").map(toldOf) };
    return { ok: true, buildPlan: verdict.buildPlan, locator: verdict.locator, declared };
  } catch (error) {
    // Only the error's kind: its words may quote a value.
    return { ok: false, codes: [error instanceof Error && error.name ? error.name : "unknown"] };
  }
}

function toldOf(issue: { code: string; message: string; path?: string | undefined }): { code: string; step?: number; said?: string } {
  const step = STEP_PATH.exec(issue.path ?? "")?.[1];
  return { code: issue.code, ...(step === undefined ? {} : { step: Number(step) }), ...(TOLD.has(issue.code) && issue.message ? { said: issue.message } : {}) };
}
