// The project supervisor (automation-project-agents-plan.md, `Role Model`,
// unit A5a): the agent that plans a Flow's build, briefs a builder per
// subflow, reads what each hands back, assembles the whole candidate and
// tests it. It never acts on the target and never writes a step.
//
// It is the evidence loop the candidate authoring loop runs
// (`../../flow-bootstrap/candidate/authoring-loop.ts`) with the supervisor's
// tools: the harness's observe-only tools (`./role-tools.ts`), its own
// `project.*` tools and the whole candidate's trial (`./tools.ts`), each
// intercepted in `executeTool`, and its own completion (`./completion.ts`).
// It plans rather than acts (`./planning.ts`, t569): its own tools are its
// planning tools, its looks run out after its look budget, and every note the
// loop gives it names its next planning step rather than an act.
// Draft and dry run are off -- the supervisor takes no step a Flow could keep
// -- and it is not discovery-only, which is a candidate builder's mode. No
// `budget` wrap-up: the purse and `maxIterations` bound it.
//
// Its decisions and the whole trial's judge run in a purse run frame of their
// own (`../../llm/build-purse/run.ts`), so a refusal the supervisor met is its
// own and ends it honestly, and inside `withAutomationStudioProjectAgent`
// with the role `supervisor`, so the chat and the step log say which agent
// did the work. A builder's own frame, opened by the dispatcher inside this
// one, is innermost and wins for the builder's work.
//
// The build record is written as the run goes, never at the end, and read
// first: a supervisor started again on a build under way sees its plan,
// briefs and returns. The run ends with a candidate that passed its whole
// trial, for the caller to promote and then end the record `promoted`, or
// with an ending it recorded itself: the honest ending the model gave, the
// money running out, a cancel, or a loop that stopped short. Every ending
// names, in Core's words, what this build still has on the target
// (`./left-on-target.ts`).
//
// **A loop a guard stopped puts the target back first (t586).** Bigbox
// `run-mv85vjqo` stalled on the refusal-run guard: under
// `propagateDecisionErrors` the stall is thrown out of the loop, so no ending
// was recorded, no reset ran and the build's acts stayed on the site untold.
// The stall the loop's `unusableDecisions` builds is now known when it is
// thrown; that one, and a loop that returned stopped short, end the way the
// model's honest ending does (`./completion.ts`): while a reset brief could
// still undo acts of this build and none came back after its last other brief,
// Core dispatches one itself (`./dispatch-tool.ts`, sized from the purse as
// any brief is), then records the ending naming what is still left. A thrown
// stall is then thrown on, so the caller ends the build as it did.
import { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../../flow-bootstrap/generation-failure/index.ts";
import { automationStudioLlmBuildPurseRun, AutomationStudioLlmBuildPurseRefused } from "../../llm/build-purse/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import type { AutomationStudioProjectBuildEnding } from "../record/index.ts";
import { automationStudioProjectSupervisorAssembleTool } from "./assemble-tool.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA, automationStudioProjectSupervisorCompletion, type AutomationStudioProjectSupervisorEnded } from "./completion.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { automationStudioProjectSupervisorDispatchTool } from "./dispatch-tool.ts";
import { automationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import { automationStudioProjectSupervisorPlanTool } from "./plan-tool.ts";
import { automationStudioProjectSupervisorPlanning } from "./planning.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import { automationStudioProjectSupervisorReadTask } from "./read-task.ts";
import { automationStudioProjectSupervisorHostTools } from "./role-tools.ts";
import { AutomationStudioProjectSupervisorState } from "./state.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "./tool-ids.ts";
import { automationStudioProjectSupervisorTools } from "./tools.ts";
import { AutomationStudioProjectSupervisorWholeTrial } from "./whole-trial.ts";

/** What the supervisor's loop is given of the evidence loop: everything the supervisor does not set itself. */
export type AutomationStudioProjectSupervisorLoopInput = Omit<AutomationStudioLlmEvidenceLoopInput,
  "draft" | "dryRun" | "discoveryOnly" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "budget" | "purse" | "callScope" | "finishingTools" | "planning" | "signal" | "recoverStall">;

/** How a supervisor run ended. Never promotion: `candidate` hands the caller a candidate to promote. */
export type AutomationStudioProjectSupervisorOutcome = {
  /** Absent only when the purse refused a call before the loop could say how it ended. */
  loop: AutomationStudioLlmEvidenceLoopResult | undefined;
  /** `candidate`: completed on a yes for the latest assembled revision (or, with no trial runner, on that draft); `ended`: the ending below was recorded. */
  status: "candidate" | "ended";
  candidate: AutomationStudioFlowCandidate | undefined;
  trial: AutomationStudioCandidateTrialResult | undefined;
  ending?: AutomationStudioProjectBuildEnding;
  promotionAllowed: false;
};

export async function runAutomationStudioProjectSupervisorLoop(input: {
  ports: AutomationStudioProjectSupervisorPorts;
  loop: AutomationStudioProjectSupervisorLoopInput;
  /** Wraps the loop's input before it runs, as the candidate loop's `observe` does, for the chat. */
  observe?: ((loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput) | undefined;
}): Promise<AutomationStudioProjectSupervisorOutcome> {
  const { ports } = input;
  const signals = [ports.signal, ports.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const state = new AutomationStudioProjectSupervisorState();
  const view = await ports.record.read(ports.build);
  if (view?.record.ending) throw new Error("project.record_ended");
  if (view) state.load(view);
  else await ports.record.create({ ...ports.build, instructionDigest: ports.instructionDigest, sourceIds: ports.sources.map((source) => source.sourceId) });
  // The judged whole run and one repair round are kept back from every builder's allowance (`Allowance`).
  if (ports.purse && ports.reserve) {
    ports.purse.keepBackForJudging(ports.reserve);
    // The build's own finishing is kept from every builder's share of the calls, as judging is (t570).
    if (ports.finishing) ports.purse.keepBackCallsFromAllowances(ports.finishing.supervisorCalls + ports.finishing.resetCalls);
    if (!view?.record.allowances.some((allowance) => allowance.role === "supervisor")) await ports.record.recordAllowance(ports.build, { role: "supervisor", usd: ports.purse.keptBackUsd() });
  }
  const controller = new AutomationStudioFlowCandidateSubmissionController(signal ? { ...ports.submission, signal } : ports.submission);
  // The whole trial's gate puts the target back as a candidate build's does: start hook first, then the build's ledgers (`./whole-trial.ts`).
  const wholeTrial = new AutomationStudioProjectSupervisorWholeTrial({ ports, state });
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial: ports.trial, signal, reset: wholeTrial.reset });
  const context: AutomationStudioProjectSupervisorContext = { ports, state, controller, gate, signal };
  let ended: AutomationStudioProjectSupervisorEnded | undefined;
  const checkCompletion = automationStudioProjectSupervisorCompletion(context, (ending) => {
    ended = ending;
  });
  const own = automationStudioProjectSupervisorTools();
  // The stall a guard ends the loop with, as the loop's own `unusableDecisions` built it (header).
  let stall: { error: unknown; issueCodes: readonly string[] } | undefined;
  const unusable = input.loop.unusableDecisions;
  const loopInput: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop,
    ...(unusable ? {
      unusableDecisions: {
        ...unusable,
        stalled: (stalled) => {
          const error = unusable.stalled(stalled);
          stall = { error, issueCodes: [...stalled.issueCodes] };
          return error;
        }
      }
    } : {}),
    draft: false,
    dryRun: false,
    tools: [...automationStudioProjectSupervisorHostTools(input.loop.tools), ...own],
    completionSchema: AUTOMATION_STUDIO_PROJECT_SUPERVISOR_COMPLETION_SCHEMA,
    planning: automationStudioProjectSupervisorPlanning(context),
    executeTool: async (call) => {
      switch (call.toolId) {
        case IDS.readTask: return automationStudioProjectSupervisorReadTask(context);
        case IDS.writePlan: return automationStudioProjectSupervisorPlanTool(context, call.value, "write");
        case IDS.amendPlan: return automationStudioProjectSupervisorPlanTool(context, call.value, "amend");
        case IDS.dispatch: return automationStudioProjectSupervisorDispatchTool(context, call.value);
        case IDS.assemble: return automationStudioProjectSupervisorAssembleTool(context, call.value);
        case IDS.testCandidate: return wholeTrial.test(context, call.value, call.signal);
        default: return input.loop.executeTool(call);
      }
    }
  };
  if (ports.purse) loopInput.purse = ports.purse;
  if (signal) loopInput.signal = signal;
  const observed = input.observe ? input.observe(loopInput) : loopInput;
  let loop: AutomationStudioLlmEvidenceLoopResult | undefined;
  let outOfMoney = false;
  let stalled: { error: unknown; issueCodes: readonly string[] } | undefined;
  try {
    loop = await withAutomationStudioProjectAgent({ role: "supervisor" }, () => automationStudioLlmBuildPurseRun(ports.purse, () => runAutomationStudioLlmEvidenceLoop({ ...observed, checkCompletion })));
  } catch (error) {
    if (error instanceof AutomationStudioLlmBuildPurseRefused) outOfMoney = true;
    else if (stall && error === stall.error && !signal?.aborted) stalled = stall;
    else throw error;
  }
  const candidate = controller.latest();
  const done = (status: "candidate" | "ended", ending?: AutomationStudioProjectBuildEnding): AutomationStudioProjectSupervisorOutcome => ({ loop, status, candidate, trial: gate.standing(candidate), ...(ending ? { ending } : {}), promotionAllowed: false });
  if (loop?.ok && !ended) return done("candidate");
  const stoppedBy = loop && !loop.ok ? loop.code : stalled ? stalled.issueCodes[0] ?? "stalled" : undefined;
  const cancelled = signal?.aborted === true || stoppedBy === "llm_evidence_loop.cancelled";
  const finished: AutomationStudioProjectSupervisorEnded | { outcome: "cancelled" | "partial" | "blocked"; reason: string } = outOfMoney
    ? { outcome: state.anyDone() ? "partial" : "blocked", reason: "The Flow's spending limit could not pay for the supervisor's next call, so the build stopped before a whole trial passed." }
    : loop?.ok && ended
      ? ended
      : cancelled
        ? { outcome: "cancelled", reason: "The build was cancelled." }
        : { outcome: state.anyDone() ? "partial" : "blocked", reason: `The supervisor stopped before a whole trial passed (${stoppedBy ?? "unknown"}).` };
  // A guard stopped the loop: the target is put back, where a reset brief still can, before the ending names what is left (header).
  if (!outOfMoney && !cancelled && finished !== ended && !personEnded(stalled?.error)) await resetBeforeEnding(context);
  // An ending the model gave already names what is left (`./completion.ts`); every other ending Core names it in here.
  const named = finished === ended ? finished : { ...finished, reason: automationStudioProjectSupervisorLeftOnTarget(ports, state).reason(finished.reason) };
  const ending = await ports.record.end(ports.build, named);
  if (stalled) throw stalled.error;
  return done("ended", ending);
}

/** The endings a stall yields to because the person was asked and did not answer yes: no brief is sent past them. */
const PERSON_ENDINGS: ReadonlySet<string> = new Set(["flow_bootstrap.permission_required", "flow_bootstrap.user_intervention_required"]);

/** Whether the loop ended on a question put to the person rather than a guard (`service/flow-bootstrap-commands/unusable-decisions.ts`). */
function personEnded(error: unknown): boolean {
  return error instanceof AutomationStudioFlowBootstrapGenerationError && PERSON_ENDINGS.has(error.diagnostic.code);
}

/** Why Core dispatched the reset itself, for the build record. */
const CORE_RESET_REASON = "The supervisor stopped before a whole trial passed, so Core puts back the lasting acts this build made before the build ends.";

/**
 * Core's own reset brief before an ending a guard forced (header): only while
 * a reset could still undo an act of this build, none came back after the
 * build's last other brief, a plan is in force and a purse can size it. Its
 * dispatch is the supervisor's own tool, so it is recorded, shown and sized as
 * any brief is; a refusal of it, or a purse that cannot pay for it, leaves the
 * ending to name what is left.
 */
async function resetBeforeEnding(context: AutomationStudioProjectSupervisorContext): Promise<void> {
  const { ports, state } = context;
  const structure = state.structure;
  const left = automationStudioProjectSupervisorLeftOnTarget(ports, state);
  if (!ports.purse || !structure || !state.taskSpec || !left.undoable || state.resetCameBackLast()) return;
  const keys = new Set(structure.plan.subflows.map((subflow) => subflow.key));
  const owner = left.acts.find((act) => act.undoable)?.brief;
  const ownerKey = state.briefs.find((brief) => brief.briefId === owner)?.subflowKey;
  const subflowKey = ownerKey && keys.has(ownerKey) ? ownerKey : structure.plan.subflows[0]?.key;
  if (!subflowKey) return;
  const value = { reason: CORE_RESET_REASON, briefs: [{ kind: "reset", subflowKey, entry: { caseId: "observed-current", predecessors: [] } }] };
  try {
    await withAutomationStudioProjectAgent({ role: "supervisor" }, () => automationStudioLlmBuildPurseRun(ports.purse, () => automationStudioProjectSupervisorDispatchTool(context, value)));
  } catch (error) {
    if (!(error instanceof AutomationStudioLlmBuildPurseRefused)) throw error;
  }
}
