// Whether a model's completed Flow Bootstrap result can be built, checked
// while the exploration can still ask again.
//
// Creation used to check the completed plan only after the exploration had
// ended, so a plan that failed any check ended the whole run: a live build
// spent its call, completed with a plan whose parameter did not validate, and
// stopped with `evidence_completion_plan_invalid` and no word on which check
// refused it. A refused plan is a model failure like a malformed reply, and the
// model can correct it if it is told what was wrong.
//
// So every check a completed result must pass runs here, as the evidence
// loop's completion check: the wrapper, the plan's structure, the evidence
// profile's limits, the domain's resolution of each node's parameters, and the
// registry validation. A result that passes is handed back ready to persist. A
// result that fails comes back with the code creation fails under, the issues
// that refused it, and the feedback the model sees before it is asked again --
// issue codes and plan paths, which are the plan's own structure, and the
// shape each refused parameter accepts, read from its node definition
// (`automationStudioFlowBootstrapIssueFeedback`) -- never page content and never
// a validator's prose.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import {
  acceptAutomationStudioFlowBootstrapResult,
  automationStudioFlowBootstrapIssueFeedback,
  isAutomationStudioEvidenceFlowBootstrapResultWithinLimits,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapIssue,
  type AutomationStudioFlowBootstrapPhaseFailureCode,
  type AutomationStudioFlowBuildPlan
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../evidence-loop.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "./binding.ts";
import { AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY, AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY } from "./plan-node-handles.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters } from "./plan-parameter-resolution.ts";

export type AutomationStudioFlowBootstrapCompletionFailureCode = Extract<AutomationStudioFlowBootstrapPhaseFailureCode,
  | "flow_bootstrap.evidence_completion_wrapper_invalid"
  | "flow_bootstrap.evidence_completion_plan_invalid"
  | "flow_bootstrap.evidence_completion_profile_limit_exceeded"
  | "flow_bootstrap.evidence_completion_parameters_unresolved">;

export type AutomationStudioFlowBootstrapCompletionVerdict =
  | { ok: true; summary: string; buildPlan: AutomationStudioFlowBuildPlan }
  | {
    ok: false;
    code: AutomationStudioFlowBootstrapCompletionFailureCode;
    issues: AutomationStudioFlowBootstrapIssue[];
    /** What the evidence loop is told: the codes, and the model's feedback. */
    check: Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }>;
  };

/** Issues the model is shown at once; the rest are dropped, not summarised. */
const MAX_FEEDBACK_ISSUES = 16;

const FEEDBACK_INSTRUCTION = "The completed plan was refused and nothing was created. Correct every listed issue and complete again. "
  + "Where an issue carries accepted, it is what that parameter takes: write only the keys it names, beside a handle where one belongs, and follow its example. "
  + `Where a parameter needs something you observed, write {"${AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY}": "<handle copied exactly from evidence>"} instead of writing a locator of your own; `
  + `if you explored more than one place, add "${AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY}": "<the location the evidence reported for that handle>". `
  + "A code written <code>:<path> names where inside that node's parameters the issue is, with keys you chose given by their position; "
  + "a parameter's own description names any further keys it takes beside the handle. "
  // A live build authored the right acting steps, had each one refused for a
  // handle it had invented, and completed again with those steps deleted and
  // the wrong answer in their place. A refusal is about how a step was
  // written, never about whether the instruction needed it.
  + "Correct each refused step; never delete one the instruction needs, and never replace it with a step that answers something else. "
  + "A handle is refused when it is not one the evidence printed: reread the evidence and copy that token exactly, rather than writing one that looks like it.";

/** Every check a completed evidence-guided result must pass before it is built. */
export async function checkAutomationStudioFlowBootstrapCompletion(input: {
  result: JsonObject;
  projectId: string;
  flowId: string;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  binding?: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "resolvePlanNodeParameters"> | undefined;
}): Promise<AutomationStudioFlowBootstrapCompletionVerdict> {
  const { result } = input;
  const about = (plan: unknown): RefusalSubject => ({ plan, registry: input.registry, resolution: input.resolution });
  if (!Object.keys(result).length) {
    return refused("flow_bootstrap.evidence_completion_wrapper_invalid", [issue("bootstrap.completion_wrapper_invalid", "result")]);
  }
  // One door for every shape a build may arrive in -- a Flow script, or the
  // nested plan that was once the only one -- and one place that normalises it.
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result, registry: input.registry, resolution: input.resolution });
  // An issue about a normalised plan still carries the path of the plan the
  // model wrote, so the shape a refused parameter accepts is read from that one.
  const written = typeof result.plan === "object" && result.plan !== null && !Array.isArray(result.plan) ? result.plan : result;
  // A refused Flow script carries the plan its steps got as far as, and the
  // issues' paths are that plan's. Read from the reply instead, as it was
  // before, and `bootstrap.unknown_parameter` came back naming a path into a
  // plan the model never wrote with nothing beside it -- so it wrote the same
  // key again. The nested JSON plan is the model's own writing and stays.
  if (!accepted.ok) return refused("flow_bootstrap.evidence_completion_plan_invalid", errors(accepted.issues), about(accepted.refusedPlan ?? written));
  const parsed = parseAutomationStudioFlowBootstrapPlan(accepted.plan);
  if (!parsed.plan || parsed.issues.some((item) => item.severity === "error")) {
    return refused("flow_bootstrap.evidence_completion_plan_invalid", errors(parsed.issues), about(accepted.plan));
  }
  if (!isAutomationStudioEvidenceFlowBootstrapResultWithinLimits({ summary: accepted.summary, plan: parsed.plan })) {
    return refused("flow_bootstrap.evidence_completion_profile_limit_exceeded", [issue("bootstrap.completion_profile_limit_exceeded", "result")]);
  }
  const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: parsed.plan,
    projectId: input.projectId,
    flowId: input.flowId,
    binding: input.binding,
    handlesIssued: true
  });
  if (!resolved.ok) return refused("flow_bootstrap.evidence_completion_parameters_unresolved", resolved.issues, about(parsed.plan));
  let validated: ReturnType<typeof validateAutomationStudioFlowBootstrapPlan>;
  try {
    validated = validateAutomationStudioFlowBootstrapPlan({ plan: resolved.plan, registry: input.registry, resolution: input.resolution });
  } catch {
    // A check that throws refuses the plan under a code of its own, rather than
    // ending creation with a record that cannot say what happened.
    return refused("flow_bootstrap.evidence_completion_plan_invalid", [issue("bootstrap.validation_failed", "plan")]);
  }
  if (!validated.ok || !validated.validated) return refused("flow_bootstrap.evidence_completion_plan_invalid", errors(validated.issues), about(resolved.plan));
  return { ok: true, summary: accepted.summary, buildPlan: validated.validated };
}

/** The plan a refusal is about, and where its nodes are defined. */
type RefusalSubject = { plan: unknown; registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution };

/**
 * A refusal, fed back with each issue and, where the plan it is about and the
 * registry can say, the shape each refused parameter accepts.
 */
function refused(
  code: AutomationStudioFlowBootstrapCompletionFailureCode,
  issues: AutomationStudioFlowBootstrapIssue[],
  about?: RefusalSubject
): AutomationStudioFlowBootstrapCompletionVerdict {
  const shown = issues.slice(0, MAX_FEEDBACK_ISSUES);
  return {
    ok: false,
    code,
    issues,
    check: {
      ok: false,
      issueCodes: [...new Set(shown.map((item) => item.code))],
      feedback: {
        ok: false,
        code: "flow_bootstrap.completion_refused",
        refusal: code,
        issues: automationStudioFlowBootstrapIssueFeedback({ issues: shown, ...(about ? { plan: about.plan, registry: about.registry, resolution: about.resolution } : {}) }),
        instruction: FEEDBACK_INSTRUCTION
      }
    }
  };
}

function errors(issues: AutomationStudioFlowBootstrapIssue[]): AutomationStudioFlowBootstrapIssue[] {
  const found = issues.filter((item) => item.severity === "error");
  return found.length ? found : [issue("bootstrap.invalid_plan", "plan")];
}

function issue(code: string, path: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message: "The completed result was refused.", path };
}
