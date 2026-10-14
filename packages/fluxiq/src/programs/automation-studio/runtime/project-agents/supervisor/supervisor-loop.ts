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
import { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
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
import { automationStudioProjectSupervisorWholeTrial } from "./whole-trial.ts";

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
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial: ports.trial, signal });
  const context: AutomationStudioProjectSupervisorContext = { ports, state, controller, gate, signal };
  let ended: AutomationStudioProjectSupervisorEnded | undefined;
  const checkCompletion = automationStudioProjectSupervisorCompletion(context, (ending) => {
    ended = ending;
  });
  const own = automationStudioProjectSupervisorTools();
  const loopInput: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop,
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
        case IDS.testCandidate: return automationStudioProjectSupervisorWholeTrial(context, call.value, call.signal);
        default: return input.loop.executeTool(call);
      }
    }
  };
  if (ports.purse) loopInput.purse = ports.purse;
  if (signal) loopInput.signal = signal;
  const observed = input.observe ? input.observe(loopInput) : loopInput;
  let loop: AutomationStudioLlmEvidenceLoopResult | undefined;
  let outOfMoney = false;
  try {
    loop = await withAutomationStudioProjectAgent({ role: "supervisor" }, () => automationStudioLlmBuildPurseRun(ports.purse, () => runAutomationStudioLlmEvidenceLoop({ ...observed, checkCompletion })));
  } catch (error) {
    if (!(error instanceof AutomationStudioLlmBuildPurseRefused)) throw error;
    outOfMoney = true;
  }
  const candidate = controller.latest();
  const trial = gate.standing(candidate);
  const done = (status: "candidate" | "ended", ending?: AutomationStudioProjectBuildEnding): AutomationStudioProjectSupervisorOutcome => ({ loop, status, candidate, trial, ...(ending ? { ending } : {}), promotionAllowed: false });
  if (loop?.ok && !ended) return done("candidate");
  const stoppedBy = loop && !loop.ok ? loop.code : undefined;
  const finished: AutomationStudioProjectSupervisorEnded | { outcome: "cancelled" | "partial" | "blocked"; reason: string } = outOfMoney
    ? { outcome: state.anyDone() ? "partial" : "blocked", reason: "The Flow's spending limit could not pay for the supervisor's next call, so the build stopped before a whole trial passed." }
    : loop?.ok && ended
      ? ended
      : signal?.aborted || stoppedBy === "llm_evidence_loop.cancelled"
        ? { outcome: "cancelled", reason: "The build was cancelled." }
        : { outcome: state.anyDone() ? "partial" : "blocked", reason: `The supervisor stopped before a whole trial passed (${stoppedBy ?? "unknown"}).` };
  // An ending the model gave already names what is left (`./completion.ts`); every other ending Core names it in here.
  const named = finished === ended ? finished : { ...finished, reason: automationStudioProjectSupervisorLeftOnTarget(ports, state).reason(finished.reason) };
  return done("ended", await ports.record.end(ports.build, named));
}
