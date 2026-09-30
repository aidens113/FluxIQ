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
// profile's limits, the domain's resolution of each node's parameters, the
// registry validation, whether the Flow could answer the instruction at all,
// whether it could run at all, and whether it does every lasting thing the
// instruction asks to be done. A result that passes is handed back ready to
// persist. A result that fails comes back with the code creation fails under,
// the issues that refused it, and the feedback the model sees before it is
// asked again -- issue codes and plan paths, which are the plan's own
// structure, and the shape each refused parameter accepts, read from its node
// definition (`automationStudioFlowBootstrapIssueFeedback`) -- never page
// content and never a validator's prose.
//
// **Every check runs on every attempt, and every failure comes back at once.**
// The checks used to stop at the first refusal, so a build was told one thing
// at a time. `run-mulxsbyy-d4d4c7a1` was refused three times by three different
// checks -- the start location at decision 24, the dry run at 27, a profile
// limit at 41 -- and learned of each only after answering the last, the third
// on the forced final decision with no turn left to answer it. All three were
// true at decision 24. So a check whose input exists runs whatever the others
// said: the capability checks ask their question of the furthest plan the
// structural checks produced, the instructed acts are read off the draft, and
// the refusal lists every failure together. Only a check with nothing to look
// at is skipped -- a plan that never parsed has no nodes to resolve.
//
// **The capability checks ask what none of the others did.** Every structural
// check holds the plan to the node library: it parses, its parameters resolve,
// its nodes are registered. Neither of the questions a person would ask is
// among them.
//
// *Could this Flow answer?* Four live builds against one instruction proposed
// four different Flows as finished, one of which navigated twice, typed three
// times and read nothing. `flow-bootstrap/answerability/` answers that from the
// plan and the instruction text alone.
//
// *Could this Flow run?* `run-muht9lpw-a39aa056` built one node -- a list
// extraction with no navigation before it -- and replay failed on the blank tab
// a run starts on, `Cannot access contents of url "about:blank"`. An extraction
// on its own satisfies answerability; it simply has nowhere to do it.
// `flow-bootstrap/reachability/` answers that from the plan and the start
// location the build was given.
//
// *Does this Flow do what it was told to do?* `run-mulxk0ro-36bf090d` was told
// to save three tables and list saved items, and was accepted having only read
// a results page. `flow-bootstrap/instructed-acts/` answers that from the
// instruction's words and the steps the model names for them.
//
// None costs a provider call, and each refusal carries its own account of what
// is missing beside the issue rather than only a code.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep, automationStudioFlowBootstrapDraftStepIsWritable } from "../node-tools/index.ts";
import {
  acceptAutomationStudioFlowBootstrapResult,
  assembleAutomationStudioFlowDraftPlan,
  type AutomationStudioFlowBootstrapAcceptance,
  automationStudioEvidenceFlowBootstrapLimitsExceeded,
  automationStudioFlowBootstrapDraftWithStartStep,
  automationStudioFlowBootstrapIssueFeedback,
  checkAutomationStudioFlowBootstrapAnswersInstruction,
  checkAutomationStudioFlowBootstrapReachesStartLocation,
  checkAutomationStudioInstructedActs,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapIssue,
  type AutomationStudioFlowBootstrapPhaseFailureCode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSizeLimits,
  type AutomationStudioFlowBuildPlan
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceLoopAnswerability } from "../evidence-loop.ts";
import type { AutomationStudioLlmEvidenceRestoredStep } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "./binding.ts";
import { AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY, AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY } from "./plan-node-handles.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters } from "./plan-parameter-resolution.ts";

export type AutomationStudioFlowBootstrapCompletionFailureCode = Extract<AutomationStudioFlowBootstrapPhaseFailureCode,
  | "flow_bootstrap.evidence_completion_wrapper_invalid"
  | "flow_bootstrap.evidence_completion_plan_invalid"
  | "flow_bootstrap.evidence_completion_profile_limit_exceeded"
  | "flow_bootstrap.evidence_completion_parameters_unresolved"
  | "flow_bootstrap.evidence_completion_cannot_answer"
  | "flow_bootstrap.evidence_completion_cannot_reach_start">;

export type AutomationStudioFlowBootstrapCompletionVerdict =
  | {
    ok: true;
    summary: string;
    buildPlan: AutomationStudioFlowBuildPlan;
    check: Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: true }> & {
      answerability: AutomationStudioLlmEvidenceLoopAnswerability;
    };
  }
  | {
    ok: false;
    /** The first failure's code, in the order the checks run. Every failure's issues are in `issues`. */
    code: AutomationStudioFlowBootstrapCompletionFailureCode;
    /** Every failure's code, in the order the checks run, once each. */
    codes: AutomationStudioFlowBootstrapCompletionFailureCode[];
    issues: AutomationStudioFlowBootstrapIssue[];
    /** What the evidence loop is told: the codes, and the model's feedback. */
    check: Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }> & {
      answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
    };
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
  + "A handle is refused when it is not one the evidence printed: reread the evidence and copy that token exactly, rather than writing one that looks like it. "
  // Every decision is a fresh request with no conversation history, so a model
  // asked to complete again could not see what it had just written and wrote a
  // new answer from memory instead of correcting the old one. `previous` is
  // its own script handed back; this sentence is what tells it to amend that.
  + "Where previous is given, it is the script you just sent. Send it again with only the listed issues corrected: keep every other line exactly as it is, rather than writing the result again from memory.";

/** Said first whenever more than one check refused, so the model fixes them together. */
const SEVERAL_INSTRUCTION = "Every check was run and refusals lists each one that failed: correct all of them before completing again, not only the first.";

/** Said of a profile limit, since what to do about one is not a parameter's business. */
const LIMITS_INSTRUCTION = "limitsExceeded names each limit the result is over, its max and the actual value: shorten the summary, or drop or split what that limit counts.";

/** What the refused script may cost in the feedback before it is left out. */
const MAX_PREVIOUS_SCRIPT_LENGTH = 6_000;

/** Every check a completed evidence-guided result must pass before it is built. */
export async function checkAutomationStudioFlowBootstrapCompletion(input: {
  result: JsonObject;
  projectId: string;
  flowId: string;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  binding?: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "resolvePlanNodeParameters"> | undefined;
  /**
   * The draft the build accrued, when the Flow is to be built from what the
   * build did rather than from what the model wrote at the end.
   *
   * Given, it is authoritative: the plan is assembled from the steps that ran
   * and worked and that the model kept, and any plan the reply happens to
   * carry is ignored. That is the point of the whole design -- a Flow whose
   * steps are nodes that provably ran cannot contain one that never did.
   */
  draftSteps?: readonly AutomationStudioFlowDraftStep[] | undefined;
  /** The build's permission check for each step, handed to the domain as it resolves the step. */
  permissionFor?: ((step: { definitionId: string; ref: string }) => AutomationStudioActionPermissionCheck) | undefined;
  /**
   * The active instructions' own words, title and body, as the build read them.
   *
   * What the answerability and instructed-acts checks read. Absent -- a caller
   * with no instruction text -- leaves them with nothing to hold the Flow to,
   * and they pass: a plan is never refused for a request nobody stated.
   */
  instructionText?: string | undefined;
  /**
   * Where the Flow starts, as the build was told it
   * (`flow-bootstrap/start-location.ts`).
   *
   * What the reachability check reads. Absent -- a build handed its target
   * rather than told where it is -- leaves it with nothing to hold the Flow to,
   * and it passes: a Flow is never refused for an arrival nobody asked for.
   */
  startLocation?: string | undefined;
  /** The Flow's size bounds, from its setting (`flow-bootstrap/plan/size-limits.ts`); the default when absent. */
  size?: AutomationStudioFlowBootstrapSizeLimits | undefined;
}): Promise<AutomationStudioFlowBootstrapCompletionVerdict> {
  const { result } = input;
  const about = (plan: unknown): RefusalSubject => ({ plan, registry: input.registry, resolution: input.resolution });
  if (!Object.keys(result).length) {
    return refused([{ code: "flow_bootstrap.evidence_completion_wrapper_invalid", issues: [issue("bootstrap.completion_wrapper_invalid", "result")] }]);
  }
  // The draft wins wherever there is one. Where there is none -- a domain
  // whose actions are not nodes of the registry, or a build that completed
  // without running anything -- the reply's own plan is still read, because a
  // host that cannot run a node must still be able to build a Flow.
  //
  // The step that took the build to where its Flow starts is kept whatever the
  // amendments since said about it: the domain made the build run it before
  // anything else, and the Flow cannot take a step without it. Putting it back
  // here is the Flow the reachability refusal would have asked the model for,
  // without the turn (`flow-bootstrap/reachability/start-step.ts`).
  const withStart = input.draftSteps
    ? automationStudioFlowBootstrapDraftWithStartStep({ steps: input.draftSteps, startLocation: input.startLocation })
    : undefined;
  const draftSteps = withStart?.steps;
  // Said on the record whichever way the check goes: the Flow judged here has a
  // step the model had taken out, and a reader of the run must be able to see it.
  const restoredStep: AutomationStudioLlmEvidenceRestoredStep | undefined = withStart?.restored
    ? { step: withStart.restored.position, withdrawnAs: withStart.restored.withdrawnAs }
    : undefined;
  const proposed = draftSteps?.filter(automationStudioFlowDraftStepIsProposed) ?? [];
  const drafted = draftSteps && proposed.length && proposed.every(automationStudioFlowBootstrapDraftStepIsWritable)
    ? fromDraft(draftSteps, result, input.registry, input.resolution)
    : undefined;
  const accepted = drafted ?? fromReply(result, input.registry, input.resolution);
  // An issue about a normalised plan still carries the path of the plan the
  // model wrote, so the shape a refused parameter accepts is read from that one.
  const written = typeof result.plan === "object" && result.plan !== null && !Array.isArray(result.plan) ? result.plan : result;
  const failures: CompletionFailure[] = [];
  // The furthest plan the structural checks produced, which is what the
  // capability checks are asked of, and the plan to build when nothing failed.
  let capabilityPlan: AutomationStudioFlowBootstrapPlan | undefined;
  let buildPlan: AutomationStudioFlowBuildPlan | undefined;
  // A refused Flow script carries the plan its steps got as far as, and the
  // issues' paths are that plan's. Read from the reply instead, as it was
  // before, and `bootstrap.unknown_parameter` came back naming a path into a
  // plan the model never wrote with nothing beside it -- so it wrote the same
  // key again. The nested JSON plan is the model's own writing and stays.
  if (!accepted.ok) {
    failures.push({ code: "flow_bootstrap.evidence_completion_plan_invalid", issues: errors(accepted.issues), about: about(accepted.refusedPlan ?? written) });
  } else {
    const parsed = parseAutomationStudioFlowBootstrapPlan(accepted.plan, input.size);
    if (!parsed.plan || parsed.issues.some((item) => item.severity === "error")) {
      failures.push({ code: "flow_bootstrap.evidence_completion_plan_invalid", issues: errors(parsed.issues), about: about(accepted.plan) });
    } else {
      capabilityPlan = parsed.plan;
      // A plan Core assembled from the draft is held to the Flow's own limits;
      // one the model wrote, to what one reply may carry (`profile-limits.ts`).
      const exceeded = automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: accepted.summary, plan: parsed.plan }, drafted ? "draft" : "reply", input.size);
      if (exceeded.length) {
        failures.push({
          code: "flow_bootstrap.evidence_completion_profile_limit_exceeded",
          issues: exceeded.map((limit) => issue("bootstrap.completion_profile_limit_exceeded", limit.path, "The completed result is over one of its limits; limitsExceeded names which.")),
          detail: { key: "limitsExceeded", value: exceeded.map((limit) => ({ ...limit })), instruction: LIMITS_INSTRUCTION }
        });
      }
      const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({
        plan: parsed.plan,
        projectId: input.projectId,
        flowId: input.flowId,
        binding: input.binding,
        handlesIssued: true,
        permissionFor: input.permissionFor
      });
      if (!resolved.ok) {
        failures.push({ code: "flow_bootstrap.evidence_completion_parameters_unresolved", issues: resolved.issues, about: about(parsed.plan) });
      } else {
        capabilityPlan = resolved.plan;
        const validated = validatePlan(resolved.plan, input.registry, input.resolution, input.size);
        if (validated.threw) {
          // A check that throws refuses the plan under a code of its own, rather
          // than ending creation with a record that cannot say what happened.
          failures.push({ code: "flow_bootstrap.evidence_completion_plan_invalid", issues: [issue("bootstrap.validation_failed", "plan")] });
        } else if (!validated.outcome.ok || !validated.outcome.validated) {
          failures.push({ code: "flow_bootstrap.evidence_completion_plan_invalid", issues: errors(validated.outcome.issues), about: about(resolved.plan) });
        } else {
          buildPlan = validated.outcome.validated;
          capabilityPlan = buildPlan.plan;
        }
      }
    }
  }
  // The capability questions, of the furthest plan there is. Answering is not
  // running: a Flow that acts on the target it was told to start at and never
  // goes there fails before its first step, whatever it would have produced.
  let answerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
  if (capabilityPlan) {
    const answers = checkAutomationStudioFlowBootstrapAnswersInstruction({ plan: capabilityPlan, registry: input.registry, resolution: input.resolution, instructionText: input.instructionText });
    answerability = answers.answerability;
    if (!answers.ok) {
      failures.push({ code: "flow_bootstrap.evidence_completion_cannot_answer", issues: [answers.issue], about: about(capabilityPlan), detail: { key: "cannotAnswer", value: answers.cannotAnswer, instruction: answers.instruction } });
    }
    const reaches = checkAutomationStudioFlowBootstrapReachesStartLocation({ plan: capabilityPlan, registry: input.registry, resolution: input.resolution, startLocation: input.startLocation });
    if (!reaches.ok) {
      failures.push({ code: "flow_bootstrap.evidence_completion_cannot_reach_start", issues: [reaches.issue], about: about(capabilityPlan), detail: { key: "cannotReach", value: reaches.cannotReach, instruction: reaches.instruction } });
    }
  }
  // Read off the draft rather than the plan, so it is asked even of a draft
  // whose plan did not assemble. Only a Flow built from the draft has steps a
  // claim can name.
  const acts = checkAutomationStudioInstructedActs({ instructionText: input.instructionText, result, draftSteps: drafted ? draftSteps : undefined });
  if (!acts.ok) {
    // Filed under the cannot-answer code: a Flow that does not do what it was
    // told cannot answer the instruction, and the issue code says which way.
    failures.push({ code: "flow_bootstrap.evidence_completion_cannot_answer", issues: [acts.issue], detail: { key: "missingActs", value: acts.missingActs, instruction: acts.instruction } });
  }
  const restoredField = restoredStep ? { restoredStep } : {};
  if (failures.length || !buildPlan || !accepted.ok) {
    const verdict = refused(failures, accepted.script, answerability);
    return verdict.ok ? verdict : { ...verdict, check: { ...verdict.check, ...restoredField } };
  }
  return { ok: true, summary: accepted.summary, buildPlan, check: { ok: true, answerability: answerability ?? { recordsRequested: false, recordProducerPresent: false, recordStorePresent: false }, ...restoredField } };
}

/** Registry validation, which may throw. */
function validatePlan(
  plan: AutomationStudioFlowBootstrapPlan,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution,
  size?: AutomationStudioFlowBootstrapSizeLimits
): { threw: true } | { threw: false; outcome: ReturnType<typeof validateAutomationStudioFlowBootstrapPlan> } {
  try {
    return { threw: false, outcome: validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution, ...(size ? { size } : {}) }) };
  } catch {
    return { threw: true };
  }
}

/**
 * The plan the reply itself carried: one door for every shape a build may
 * arrive in -- a Flow script, or the nested plan that was once the only one --
 * and one place that normalises it.
 */
function fromReply(
  result: JsonObject,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): AutomationStudioFlowBootstrapAcceptance {
  return acceptAutomationStudioFlowBootstrapResult({ result, registry, resolution });
}

/**
 * The plan the build's own draft makes: the steps it ran, that worked, and that
 * the model kept, in the order it ran them.
 *
 * It goes through the same assembler a written script goes through, so keys,
 * ports, edges, the router and every parameter are derived by one piece of
 * code. A step the writer cannot write down refuses the plan rather than being
 * left out quietly -- a step that was performed and is missing from the result
 * is exactly the failure this design exists to remove.
 */
function fromDraft(
  steps: readonly AutomationStudioFlowDraftStep[],
  result: JsonObject,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): AutomationStudioFlowBootstrapAcceptance {
  const summary = typeof result.summary === "string" && result.summary.trim() ? result.summary.trim() : "Flow built from the steps that ran.";
  const assembled = assembleAutomationStudioFlowDraftPlan({
    steps: steps.filter(automationStudioFlowDraftStepIsProposed),
    write: automationStudioFlowBootstrapDraftNodeStep,
    registry,
    resolution,
    summary
  });
  if (!assembled.plan) {
    return { ok: false, issues: assembled.issues, ...(assembled.refusedPlan ? { refusedPlan: assembled.refusedPlan } : {}), script: DRAFT_SCRIPT_NOTE };
  }
  return { ok: true, plan: assembled.plan, summary, issues: assembled.issues, script: DRAFT_SCRIPT_NOTE };
}

/**
 * What a refusal hands back in place of the script the model wrote, since it
 * wrote none: the Flow is the draft, and the draft is already in front of it.
 */
const DRAFT_SCRIPT_NOTE = "The Flow is the list of steps in your draft. Correct it with amend_draft decisions -- drop, exploratory, reorder, rerun -- or run the step it is missing, then finish again.";

/** The plan a refusal is about, and where its nodes are defined. */
type RefusalSubject = { plan: unknown; registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution };

/**
 * One check's refusal: its code, its issues, the plan they are about where the
 * shape of a refused parameter can be read from it, and, for a refusal that is
 * about what the Flow lacks rather than how a step was written, its own account
 * under its own key with its own sentence.
 */
type CompletionFailure = {
  code: AutomationStudioFlowBootstrapCompletionFailureCode;
  issues: AutomationStudioFlowBootstrapIssue[];
  about?: RefusalSubject;
  detail?: { key: "cannotAnswer" | "cannotReach" | "missingActs" | "limitsExceeded"; value: JsonObject | JsonObject[]; instruction: string };
};

/**
 * Every refusal together: each issue, with the shape each refused parameter
 * accepts where the plan it is about and the registry can say, every account
 * of what is missing, and one instruction that covers them all.
 */
function refused(
  failures: readonly CompletionFailure[],
  previousScript?: string,
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability
): AutomationStudioFlowBootstrapCompletionVerdict {
  const all = failures.length ? failures : [{ code: "flow_bootstrap.evidence_completion_plan_invalid" as const, issues: [issue("bootstrap.invalid_plan", "plan")] }];
  let room = MAX_FEEDBACK_ISSUES;
  const shownIssues: AutomationStudioFlowBootstrapIssue[] = [];
  const feedbackIssues = all.flatMap((failure) => {
    const shown = failure.issues.slice(0, Math.max(0, room));
    room -= shown.length;
    shownIssues.push(...shown);
    return shown.length
      ? automationStudioFlowBootstrapIssueFeedback({ issues: shown, ...(failure.about ? { plan: failure.about.plan, registry: failure.about.registry, resolution: failure.about.resolution } : {}) })
      : [];
  });
  const codes = [...new Set(all.map((failure) => failure.code))];
  const details = Object.fromEntries(all.flatMap((failure) => failure.detail ? [[failure.detail.key, failure.detail.value]] : []));
  // A failure with no account of its own is about how the plan was written, and
  // is answered with the parameter guidance; each account brings its own.
  const instructions = [...new Set([
    ...(all.length > 1 ? [SEVERAL_INSTRUCTION] : []),
    ...all.map((failure) => failure.detail?.instruction ?? FEEDBACK_INSTRUCTION)
  ])];
  const previous = previousScript && previousScript.length <= MAX_PREVIOUS_SCRIPT_LENGTH ? { previous: previousScript } : {};
  const baseCheck: Extract<AutomationStudioLlmEvidenceCompletionCheck, { ok: false }> = {
    ok: false,
    issueCodes: [...new Set(all.flatMap((failure) => failure.issues.map((item) => item.code)))],
    feedback: {
      ok: false,
      code: "flow_bootstrap.completion_refused",
      refusal: codes[0]!,
      ...(codes.length > 1 ? { refusals: codes } : {}),
      issues: feedbackIssues,
      ...previous,
      ...details,
      instruction: instructions.join(" ")
    }
  };
  const check: Extract<AutomationStudioFlowBootstrapCompletionVerdict, { ok: false }>["check"] = answerability === undefined
    ? baseCheck
    : { ...baseCheck, answerability };
  return { ok: false, code: codes[0]!, codes, issues: all.flatMap((failure) => failure.issues), check };
}

function errors(issues: AutomationStudioFlowBootstrapIssue[]): AutomationStudioFlowBootstrapIssue[] {
  const found = issues.filter((item) => item.severity === "error");
  return found.length ? found : [issue("bootstrap.invalid_plan", "plan")];
}

function issue(code: string, path: string, message = "The completed result was refused."): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message, path };
}
