// A subflow builder: the candidate authoring loop's discovery mode, scoped to
// one brief (automation-project-agents-plan.md, `Role Model`, `Tool scopes`).
//
// The builder explores with the tools its role keeps (`./role-tools.ts`),
// submits its own subflow with `core.submit_subflow` (`./scoped-submission.ts`)
// and tries it with `core.test_subflow` (`./subflow-trial-gate.ts`). It never
// sees the whole candidate's tools, nor the supervisor's `project.*` ones, and
// its completion names its subflow, revision and digest: a proposal for the
// supervisor to assemble, never a Flow to promote.
//
// The dispatcher may give the opening call a scope (`callScope`, the brief's
// id) so two builders of one Flow running at once never share the domain's
// per-build memory of it. It passes one only when the host runs more than one
// builder at a time: without one the opening id is `initial.<toolId>` exactly,
// which is what a domain matching that id expects.
//
// The loop's wrap-up keeps this loop's own finishing tools running and names
// them (`finishingTools`), not the whole candidate's.
//
// **Its budget is its own allowance (t570).** A builder is given no build-wide
// budget (`service/project-build/brief-ports.ts` takes the build's away), so
// on A8 round 1 its loop counted nothing: no budget note ever reached the
// model, no wrap-up began, and builders ended
// `llm_evidence_loop.iteration_limit` or `llm_budget.run_call_limit` without
// submitting. Its loop now runs with a budget that counts its turns, the
// dollars and the calls of the allowance it runs under (`loop.purse`, carved
// per brief, `../../llm/build-purse/allowance-book.ts`), keeping back the
// judge calls of the two trials its wrap-up may make
// (`AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS`), so it is told what is
// left and wraps up while a submission, its trial and the completion still fit
// in its own share.
//
// **Its brief is in its submit tool (t570).** The builder reads the person's
// whole instruction, and nothing told it which parts were its own or what
// lines its part must declare: on A8 round 1 one builder wrote another
// subflow's part into its own, and another was refused
// `subflow.interface_input_mismatch` ("collect_coupon is given exactly
// itemUrl; this part declares no value"). The submit tool now names the
// brief's parts in the person's words and, for a callable subflow, the exact
// `part`, `input:` and `output:` lines it must write, by name.
//
// **Its brief is in the script's description, not the tool's (t584).** A
// tool describes itself in at most 2,000 characters
// (`../../llm/evidence-loop-decision.ts`, and the provider's preflight), and the
// brief is the person's words, as long as the parts they wrote: on A8 launch 6
// an everything-store builder with two parts and an `output:` line had a
// submit description of about 2,150 characters, and its loop refused to start,
// `llm_evidence_loop.invalid_configuration` with 0 calls, twice. So the tool's
// own description holds only what is the same for every brief, and the brief
// opens the description of its `flow` input, beside the script format, which
// has no such bound and which the tool's description points to.
//
// **It can end its brief honestly (t581).** On the A8 bigbox run every
// dependent builder's trial answered `subflow.trial_predecessor_missing`, and
// the trial gate told it to "complete with outcome blocked and say why"; its
// completion took only `subflowKey`, `revision` and `digest`, so it sent the
// one receipt four times and the loop stalled. A builder may now complete with
// `{"ended": "blocked" | "partial", "reason": "..."}` once it has submitted or
// tried something and no yes stands for its latest proposal; the outcome
// carries that ending (`ended`) for the brief's return
// (`../../project-agents/dispatch/ending.ts`), as does the last trial any of
// its revisions got (`lastTrial`), so the return can say why. A refusal of its
// completion sent again is said in a builder's terms, not a draft's
// (`../../llm/decision-handlers/completion.ts`).
//
// **A dependent builder whose part is already done says so (t594).** On A8
// launch 7 (crossborder) the first subflow also did the next subflow's lasting
// press, so every prepared entry of the second started with its part already
// done. Its builders saw that every time, and resubmitted a step that could
// not be named until the repeat guard ended each brief: nothing told them
// what to do when their own part is among what came before. A scope with
// predecessors now opens its brief by saying that a part already done where
// the subflow starts was done by a subflow before it, and that the brief then
// ends blocked saying which; and since such a builder has nothing to submit,
// `ended: "blocked"` is taken from it before anything was submitted or tried.
//
// **A passing receipt is the brief done, whatever else it carries (t601).** On
// A8 launch 8 a builder whose trial answered yes completed four times with its
// receipt plus `ended: "partial"`, which the completion schema allows beside
// it; every completion with a key a receipt lacks went to the ending check,
// which refused it as `subflow.ending_shape` and named only the ending's
// shape, and the repeat guard ended the brief partial with a yes standing. A
// completion that names the latest proposal's subflowKey, revision and digest
// is now read by what Core holds for that proposal: with a yes standing for it
// it is the receipt, and its `ended` and `reason` are set aside; with none it
// is the honest ending it also carries. Anything else is refused with the one
// shape to send: the exact receipt where a yes stands, the ending otherwise.
//
// **An unread handed-on input is said, not refused (t672).** A proposal whose
// lines read none of an input another subflow hands on carries it as
// `unneededInputs` (`./scoped-submission.ts`), and the accepted answer says so
// in a `note`: the revision stands, and the supervisor is told.
//
// **"A subflow before me did my part" is Core's to check (t676).** On three A8
// Lab runs a dependent builder ended blocked as already done before it
// submitted anything, and Core took it on its word -- once for a part that
// only reads, which no subflow before it can ever do. That ending now names
// what did it, `doneBefore: {"part": "<part id>", "act": "<act id>"}`, and is
// admitted only when the part is this brief's, asks a lasting act, and the act,
// where it names one, is one the run that prepared its entry landed: the act
// ids its opening look listed under `predecessorsLeftOnSite`
// (`./done-before.ts`). Otherwise it is refused `subflow.done_before_refused`:
// a part that asks no lasting act gets its result only from this subflow's
// own steps; an act that is not the preparation run's is
// this build's act from exploration, which every trial's reset undoes. The
// admitted claim rides on the outcome's ending for the brief's return. The
// words that tell a dependent builder to end blocked are said only where a
// part of its brief asks a lasting act, and the task's other parts are named
// as other builders' parts (`outOfScope`, `./brief-words.ts`): doing one while
// exploring is allowed, but it changes where that builder starts until a
// reset, and no step of this subflow does it.
// Words and a completion claim only: no act is refused before it runs. A
// blocked ending before anything was tried that names no such part is too soon
// again, as before t594: an entry never prepared, or a page that cannot do the
// brief's parts, reaches its honest ending through one trial, which says why.
// A permission the person did not give, or a check only a person can pass,
// ends the brief through its own signal, never this check.
//
// **A single-subflow plan's builder tests the judged whole run (t679).** Given
// `trialIsWhole`, its port's test is the whole Flow joined from its proposal
// and judged as the build's run (`../../project-agents/single-subflow/`): the
// test tool and a yes say so (`./subflow-trial-gate.ts`, `whole`), the submit
// answer's next step says a yes completes the brief. Its budget keeps back the
// judge calls of its finishing trials as every builder's does
// (`AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS`): that judge is paid from
// this builder's allowance first, with the build's judging reserve only as its
// backstop (t685, `../../llm/build-purse/judge-backstop.ts`), so the builder
// keeps calls for a last test. t679 kept none, since the judge then drew on the
// reserve alone.
//
// **A test that moved the tab shows the page it left (t738).** Photo rerun
// round 2 (`run-mvgf801u-cc23575e`, 0057-0069): a test refused after the start
// check loaded the build's start answered with no page, and the model pressed a
// stale handle six times. Every `core.test_subflow` answer now goes through the
// candidate loop's trial view (`../candidate/trial-view.ts`), as a whole
// candidate's test does: one that ran, or whose checks moved the tab, carries
// `pageAfterTrial`. The trial's `moves` -- the start check's count of the times
// it moved the target (`../site-reset/start-check.ts`) -- is read before and
// after the test, so a refusal whose reset looked at a place itself, and said
// nothing of it (office, `run-mvgf04kw-310fc169`, 0126 and 0159), shows the page too.
//
// **Advice it was already given is not handed over again (t741 D).** Social
// rerun round 3 (`run-mvgoawg4-ed85dd5a`, 0144, 0145, 0217, 0218): after each
// judged no the judges advised the same change, and the trial after the
// builder made it failed as before. Each `core.test_subflow` answer now passes
// through this loop's memory of its trials (`./repeated-advice.ts`): a judged
// no's advice less what an earlier trial's advice already said, and a note,
// `adviceRepeated`, saying so and what the trial that followed that advice
// answered.
//
// **A failed test is repaired from its failing step (t804).** E's builder
// re-tested its whole part after every one-step change. Where the trial port
// can run from a step (`fromStep`), the gate holds a failed whole test's repair
// (`./pending-repair.ts`) until a run from the failing step passes it, and the
// submit answer's `next` says so: run from that step, with its exact call, and
// test the whole part only when the whole part should work. The repair memory
// is the caller's where it passes one (`pendingRepair`), so it crosses briefs.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS, runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceCompletionCheck, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT } from "../plan/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY } from "../../llm/decision-handlers/index.ts";
import { automationStudioCandidateSubmissionRefusal, automationStudioCandidateTrialView } from "../candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import type { AutomationStudioSubflowDoneBefore, AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowBriefWords } from "./brief-words.ts";
import { automationStudioSubflowDoneBefore, automationStudioSubflowEntryLeft } from "./done-before.ts";
import { AutomationStudioSubflowPendingRepair } from "./pending-repair.ts";
import { AutomationStudioSubflowRepeatedAdvice } from "./repeated-advice.ts";
import { AUTOMATION_STUDIO_SUBFLOW_REPAIR_WORDS as REPAIR_WORDS } from "./repair-words.ts";
import { automationStudioSubflowBuilderTools } from "./role-tools.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "./scoped-submission.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID } from "./submit-tool.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowTrialPreparingPort } from "./subflow-trial-gate.ts";

/**
 * Calls a builder's budget keeps back from its count of decisions left: the
 * judge calls of the two trials its wrap-up may make, a first answer and its
 * confirmation each (`../../result-verification/verify.ts`).
 */
export const AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS = 4;

/**
 * The fewest calls a builder's share can finish in: its wrap-up's decisions
 * (`../../llm/loop-budget.ts`) and its finishing trials' judges. The project
 * supervisor never sizes a build brief below it (`../../project-agents/supervisor/brief-sizing.ts`).
 */
export const AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS + AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS;

/** The code a completion is refused under when it does not name the latest proposal, or there is none. */
const LATEST_REQUIRED = "subflow.latest_proposal_required";

/** The codes an honest ending is refused under: written wrong, sent before anything was tried, or sent while a yes stands. */
const ENDING_SHAPE = "subflow.ending_shape";
const ENDING_TOO_SOON = "subflow.ending_too_soon";
const ENDING_AFTER_YES = "subflow.ending_after_yes";
const ENDING_OUTCOMES: ReadonlySet<unknown> = new Set(["blocked", "partial"]);
const RECEIPT_KEYS: ReadonlySet<string> = new Set(["subflowKey", "revision", "digest"]);
const ENDING_KEYS: ReadonlySet<string> = new Set(["ended", "reason", "doneBefore"]);
const MAX_ENDING_REASON = 2000;
/** How a builder may end its brief without a passing proposal, as its tools and refusals say it (header). */
const HONEST_ENDING = "If nothing this brief can change would make its trial pass -- a subflow before it never prepares its entry, or the site cannot do what its parts ask -- "
  + "end the brief instead: complete with {\"ended\": \"blocked\", \"reason\": \"<why, in a sentence>\"}, or \"partial\" in place of \"blocked\" while a proposal stands.";

type ScopedInput = ConstructorParameters<typeof AutomationStudioSubflowScopedSubmissionController>[0];

/**
 * What a builder's run ends with: the loop's result, its latest proposal and
 * that proposal's partial verdict; the honest ending it completed with, when it
 * did; and the last trial any revision got, whatever came after. Never promotion.
 */
export type AutomationStudioSubflowBuilderOutcome = {
  loop: Awaited<ReturnType<typeof runAutomationStudioLlmEvidenceLoop>>;
  proposal: AutomationStudioSubflowProposal | undefined;
  trial: ReturnType<AutomationStudioSubflowTrialGate["standing"]>;
  /** The honest ending; `doneBefore` only on a blocked one whose claim Core admitted (header, t676). */
  ended?: { outcome: "blocked" | "partial"; reason: string; doneBefore?: AutomationStudioSubflowDoneBefore } | undefined;
  lastTrial?: AutomationStudioSubflowTrialResult | undefined;
  promotionAllowed: false;
};

/**
 * Why a dependent builder's blocked ending is refused before anything was tried when it names no part done before
 * (header, t676): the claim's shape where a part of its brief asks a lasting act, and otherwise that a trial comes first.
 */
function untriedEnding(scope: AutomationStudioSubflowScope, trials: boolean): string {
  const claim = automationStudioSubflowDoneBefore.acting(scope).length ? `If a subflow before it already did one of its parts, end it now with exactly ${automationStudioSubflowDoneBefore.shape}. ` : "";
  return `Nothing of this brief has been submitted or tried yet. ${claim}For any other reason -- its entry not prepared, or the site unable to do what its parts ask -- `
    + `submit the subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}${trials ? ` and test it with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}` : ""} first: ${trials ? "its trial says why it cannot pass, and " : ""}the brief can then end blocked saying so.`;
}

/** A tool's answer's evidence, where the answer is a tool execution; undefined for any other answer. */
function executionEvidence(ran: Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>): JsonValue | undefined {
  if (typeof ran !== "object" || ran === null || Array.isArray(ran) || ran.kind !== "llm_evidence_tool_execution") return undefined;
  return (ran as { evidence?: JsonValue }).evidence;
}

export async function runAutomationStudioSubflowBuilderLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly" | "callScope" | "finishingTools">;
  scope: AutomationStudioSubflowScope;
  siblings: ScopedInput["siblings"];
  submission: ScopedInput["submission"];
  /**
   * The partial-trial port, and the site reset its gate asks before each trial (`./subflow-trial-gate.ts`, t578);
   * `moves`, how many times the reset's start check has moved the target (header, t738).
   */
  trial?: { port: AutomationStudioSubflowTrialPreparingPort; reset?: AutomationStudioSiteResetTrialReset | undefined; moves?: (() => number) | undefined } | undefined;
  /** Suffixes the opening call's id; passed only when builders of one Flow may run at once (header). */
  callScope?: string | undefined;
  /** Told each proposal Core accepted, so a caller whose loop then fails still knows the latest one. */
  accepted?: ((proposal: Readonly<AutomationStudioSubflowProposal>) => void) | undefined;
  /** Wraps the loop's input before it runs, as the candidate loop's `observe` does. */
  observe?: ((loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput) | undefined;
  /**
   * The revision of an earlier brief's proposal this brief is shown and starts
   * from -- a repair's, or one an amendment carried -- which its own revisions
   * are numbered on from (`./scoped-submission.ts`, t658). Absent, they start at 1.
   */
  revisionsAfter?: number | undefined;
  /** Whether the port's test is a single-subflow plan's judged whole run (header, t679). */
  trialIsWhole?: true | undefined;
  /**
   * The memory of trials and their advice this builder adds to (header, t741 D): a caller that passes one memory to each
   * brief of a build makes advice given to an earlier brief count too. Absent, the builder keeps its own.
   */
  repeatedAdvice?: AutomationStudioSubflowRepeatedAdvice | undefined;
  /** The repair memory of this subflow (header, t804): a caller that passes one memory to each brief of it holds a repair brief to its build brief's failed test. Absent, the builder keeps its own. */
  pendingRepair?: AutomationStudioSubflowPendingRepair | undefined;
}): Promise<AutomationStudioSubflowBuilderOutcome> {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const submission: ScopedInput["submission"] = signal ? { ...input.submission, signal } : input.submission;
  const after = input.revisionsAfter !== undefined ? { revisionsAfter: input.revisionsAfter } : {};
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope: input.scope, siblings: input.siblings, submission, ...after });
  const whole = input.trialIsWhole === true;
  // A failed test's repair, checked from its failing step, where the port can run from one (header, t804).
  const repair = input.pendingRepair ?? new AutomationStudioSubflowPendingRepair();
  const fromStep = typeof input.trial?.port?.fromStep === "function";
  const gate = new AutomationStudioSubflowTrialGate({ scope: input.scope, latest: () => controller.latest(), port: input.trial?.port, signal, ...(input.trial?.reset ? { reset: input.trial.reset } : {}), ...after, ...(whole ? { whole: true as const } : {}), pendingRepair: repair });
  // The submit answer's next step where the port can run from a step (header, t804): from the failing step while a repair stands, else the test with when to ask for it.
  const withRepair = (proposal: AutomationStudioSubflowProposal, testNext: string): string => {
    if (!fromStep) return testNext;
    const pending = repair.refuses(proposal, undefined);
    return pending ? REPAIR_WORDS.next(pending.step, proposal) : `${testNext} ${REPAIR_WORDS.wholeWhenReady}`;
  };
  const subflowKey = input.scope.subflowKey;
  let tried = false;
  let lastTrial: AutomationStudioSubflowTrialResult | undefined;
  /** This builder's trials and the advice each was given (header, t741 D). */
  const advice = input.repeatedAdvice ?? new AutomationStudioSubflowRepeatedAdvice();
  let ended: AutomationStudioSubflowBuilderOutcome["ended"];
  /** The acts the run that prepared this builder's entry landed, as its opening look listed them (header, t676). */
  let entryActs: string[] = [];
  const submitTool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, effect: "observe",
    description: `Submit your subflow "${subflowKey}", written as a Flow script under "flow"${input.scope.interface ? "" : `, or a JSON plan under "plan"`}. The description of "flow" opens with your brief -- the parts of the task this subflow does, in the person's words, and how it is written -- then gives the format and examples: hold whatever you submit to that brief. Write no \`when:\` line and no other subflow: which situation runs which subflow is the structure plan's. ${automationStudioSubflowBriefWords.successCheck(input.scope)} Static validity returns a draft revision and digest, never acceptance. Correct every diagnostic and resubmit the whole subflow. Then test that exact revision with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}, and complete with the subflowKey, revision and digest only after its trial answers yes.${fromStep ? ` After a failed test, repair the failing step live and check it by testing from that step (from) before testing the whole part again.` : ""} ${HONEST_ENDING}`,
    inputSchema: { type: "object", properties: { flow: { type: "string", description: `${automationStudioSubflowBriefWords.brief(input.scope)}\nThis subflow as a script. ${AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT}` }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
  };
  const receiptCheck = (result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck => {
    const proposal = controller.latest();
    if (!proposal) return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: false, instruction: `No proposal of this subflow stands, so there is no revision or digest to complete with: never invent them. Submit the subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}${gate.available ? `, test it with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}` : ""}, then complete with the subflowKey, revision and digest it returned.` } };
    const named = result.subflowKey === subflowKey && typeof result.revision === "number" && typeof result.digest === "string" && Object.keys(result).every((key) => key === "subflowKey" || key === "revision" || key === "digest");
    if (!named || !controller.matches({ revision: result.revision as number, digest: result.digest as string })) {
      return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: true, subflowKey, revision: proposal.revision, digest: proposal.digest,
        instruction: `This is not the latest proposal of this subflow. Complete with exactly {"subflowKey": ${JSON.stringify(subflowKey)}, "revision": ${proposal.revision}, "digest": "${proposal.digest}"} and nothing else${gate.available ? `, after ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} has answered yes for that revision` : ""}.` } };
    }
    return gate.completion({ revision: proposal.revision, digest: proposal.digest });
  };
  // The latest proposal when a yes stands for it, its entry prepared; undefined otherwise.
  const passed = (): AutomationStudioSubflowProposal | undefined => {
    const proposal = controller.latest();
    const standing = gate.standing(proposal);
    return proposal && standing?.verdict === "yes" && standing.entryPrepared ? proposal : undefined;
  };
  // The one shape to send, by what stands (header, t601): the exact receipt where a yes stands for the latest proposal, the honest ending otherwise.
  const shapeRefused = (): AutomationStudioLlmEvidenceCompletionCheck => {
    const proposal = passed();
    if (proposal) return endingRefused(ENDING_SHAPE, `Revision ${proposal.revision} of this subflow passed its trial, so the brief is done: complete with exactly {"subflowKey": ${JSON.stringify(subflowKey)}, "revision": ${proposal.revision}, "digest": "${proposal.digest}"} and nothing else.`);
    return endingRefused(ENDING_SHAPE, "No trial answered yes for the latest proposal of this subflow, so this completion can only end the brief: send exactly {\"ended\": \"blocked\", \"reason\": \"<why, in a sentence>\"}, or \"partial\" in place of \"blocked\" while a proposal stands, and nothing else. "
      + `The receipt -- exactly subflowKey, revision and digest -- is sent only once ${gate.available ? `${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} has answered yes for that revision` : "a proposal stands"}.`);
  };
  // An honest ending (header): its shape, then only once something was tried and while no yes stands for the latest proposal.
  const endingCheck = (result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck => {
    const reason = typeof result.reason === "string" ? result.reason.trim() : "";
    if (!ENDING_OUTCOMES.has(result.ended) || !reason || Object.keys(result).some((key) => !ENDING_KEYS.has(key))) return shapeRefused();
    // A dependent builder may find its part already done at its entry, with nothing to submit (header, t594).
    if (!tried && !(result.ended === "blocked" && input.scope.predecessors.length)) return endingRefused(ENDING_TOO_SOON, `Nothing of this brief has been submitted or tried yet, so there is nothing to end on. Submit the subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}${gate.available ? ` and test it with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}` : ""} first.`);
    // A dependent builder's blocked ending before anything was tried is only "a subflow before it did my part"; for any other
    // reason -- its entry not prepared, a page that cannot do its parts -- its first trial says why, so it tries first (header, t676).
    if (!tried && result.doneBefore === undefined) return endingRefused(ENDING_TOO_SOON, untriedEnding(input.scope, gate.available));
    // Before anything was tried, and wherever it is named, "a subflow before it did my part" is Core's to check (header, t676).
    const claim = result.doneBefore !== undefined || !tried ? automationStudioSubflowDoneBefore.check(input.scope, result.ended, result.doneBefore, entryActs) : undefined;
    if (claim && !claim.ok) return endingRefused(claim.code, claim.instruction);
    const proposal = passed();
    if (proposal) {
      return endingRefused(ENDING_AFTER_YES, `Revision ${proposal.revision} of this subflow passed its trial, so the brief is done: complete with exactly {"subflowKey": ${JSON.stringify(subflowKey)}, "revision": ${proposal.revision}, "digest": "${proposal.digest}"}.`);
    }
    ended = { outcome: result.ended as "blocked" | "partial", reason: reason.slice(0, MAX_ENDING_REASON), ...(claim?.ok ? { doneBefore: claim.doneBefore } : {}) };
    return { ok: true };
  };
  // A receipt beside an ending (header, t601): read by what Core holds for the proposal it names, never refused for carrying both.
  const mixedCheck = (result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck => {
    const proposal = controller.latest();
    const namesLatest = proposal !== undefined && result.subflowKey === subflowKey && typeof result.revision === "number" && typeof result.digest === "string" && controller.matches({ revision: result.revision, digest: result.digest });
    if (!namesLatest) return shapeRefused();
    if (passed()) return gate.completion({ revision: proposal.revision, digest: proposal.digest });
    return endingCheck(Object.fromEntries(Object.entries(result).filter(([key]) => ENDING_KEYS.has(key))) as JsonObject);
  };
  const completionCheck = (result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck => {
    const keys = Object.keys(result);
    if (keys.some((key) => !RECEIPT_KEYS.has(key) && !ENDING_KEYS.has(key))) return shapeRefused();
    const receipt = keys.some((key) => RECEIPT_KEYS.has(key));
    const ending = keys.some((key) => ENDING_KEYS.has(key));
    return receipt && ending ? mixedCheck(result) : ending ? endingCheck(result) : receiptCheck(result);
  };
  const checkCompletion: NonNullable<AutomationStudioLlmEvidenceLoopInput["checkCompletion"]> = async (result) => {
    const check = completionCheck(result);
    // A refusal sent again is said in a builder's terms (header).
    return check.ok || !check.feedback ? check : { ...check, feedback: { ...check.feedback, [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY]: BUILDER_SENT_AGAIN } };
  };
  const discovery: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop, draft: false, dryRun: false, discoveryOnly: true,
    // Its turns, its allowance's dollars and its calls, less its finishing trials' judges (header, t570), a whole test's too (t685).
    budget: { ...(input.loop.budget ?? {}), countCalls: { keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS } },
    finishingTools: { submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID },
    tools: [...automationStudioSubflowBuilderTools(input.loop.tools), submitTool, gate.tool],
    // The receipt of the latest proposal, or an honest ending (header): either whole, and a passing receipt stands whatever else it carries (t601).
    completionSchema: completionSchema(subflowKey),
    executeTool: async (call) => {
      if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID) {
        // The page the test left, when it ran or its checks moved the tab (header, t738).
        const moves = input.trial?.moves;
        const before = moves?.();
        const tested = await gate.test(call.value, call.signal);
        const targetMoved = before !== undefined && moves!() > before;
        const viewed = await automationStudioCandidateTrialView({ answer: tested, targetMoved, tools: input.loop.tools, executeTool: (look) => input.loop.executeTool(look), callId: call.callId, signal: call.signal ?? signal });
        // A judged no's advice less what an earlier trial's advice already said (header, t741 D).
        const answered = advice.told(viewed);
        const trial = answeredTrial(answered, gate);
        if (trial) {
          tried = true;
          lastTrial = trial;
        }
        return answered;
      }
      if (call.toolId !== AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID) {
        const ran = await input.loop.executeTool(call);
        // A read refused for a cut-short text field, so later advice to add that field is said as the order that can pass (S5).
        advice.saw(ran);
        // What the preparation run landed, as the opening look's entry note lists it (header, t676).
        if (isOpeningCall(call.callId)) entryActs = automationStudioSubflowEntryLeft.acts(executionEvidence(ran));
        return ran;
      }
      tried = true;
      const submitted = await controller.submit(call.value, { trialOf: (proposal) => gate.standing(proposal), refuted: (digest) => gate.refuted(digest) });
      if (!submitted.ok) {
        const refusal = automationStudioCandidateSubmissionRefusal(submitted);
        return { kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, ...refusal };
      }
      input.accepted?.(structuredClone(submitted.proposal));
      const evidence: JsonObject = {
        ok: true, status: "draft", partial: true, subflowKey, revision: submitted.proposal.revision, digest: submitted.proposal.digest,
        changedPaths: [...submitted.proposal.changedPaths], verification: "not_performed", promotionAllowed: false,
        ...acceptedScript(call.value, submitted.proposal),
        ...unneededNote(submitted.proposal),
        ...(submitted.advice?.length ? { advice: submitted.advice } : {}),
        next: !gate.available
          ? "No subflow trial runner is available here; completing leaves an untried proposal."
          : withRepair(submitted.proposal, whole
            ? `Test next with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} using exactly {"revision": ${submitted.proposal.revision}, "digest": "${submitted.proposal.digest}"}. This test runs the whole Flow from its start as the build's judged run; a yes completes this brief. Submitting again makes a new revision that needs its own test.`
            : `Test next with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} using exactly {"revision": ${submitted.proposal.revision}, "digest": "${submitted.proposal.digest}"}. Do not complete until that exact revision's trial answers yes. Submitting again makes a new revision that needs its own trial.`)
      };
      return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true };
    }
  };
  if (signal) discovery.signal = signal;
  if (input.callScope !== undefined) discovery.callScope = input.callScope;
  const loop = await runAutomationStudioLlmEvidenceLoop({ ...(input.observe ? input.observe(discovery) : discovery), checkCompletion });
  const proposal = controller.latest();
  return { loop, proposal, trial: gate.standing(proposal), ...(loop.ok && ended ? { ended } : {}), ...(lastTrial ? { lastTrial } : {}), promotionAllowed: false };
}

/**
 * A builder's completion (header, t601): one object holding the receipt or the
 * honest ending whole, as `checkCompletion` reads it, so the schema and the
 * check agree that a receipt beside an ending is read by what stands for the
 * proposal it names.
 */
function completionSchema(subflowKey: string): JsonObject {
  return {
    type: "object",
    description: "Either the receipt of the latest proposal once its trial answered yes -- exactly subflowKey, revision and digest -- or an honest ending -- exactly ended and reason, and doneBefore only where a subflow before this one did one of its parts. A receipt whose trial answered yes is taken as the brief done whatever else it carries.",
    properties: {
      subflowKey: { type: "string", const: subflowKey }, revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string" },
      // The part a subflow before this one did, and the act its entry note lists for it (header, t676).
      doneBefore: { type: "object", description: "Only on a blocked ending of a brief whose part a subflow before it did: that part's id, and the act id its entry note lists under predecessorsLeftOnSite for it.", properties: { part: { type: "string" }, act: { type: "string" } }, required: ["part"], additionalProperties: false }
    },
    anyOf: [{ required: ["subflowKey", "revision", "digest"] }, { required: ["ended", "reason"] }],
    additionalProperties: false
  };
}

/** What a builder is told when the same refusal of its completion comes again (header). */
const BUILDER_SENT_AGAIN = "The check reads the trial gate's answer for the revision named, not the completion's words, so the same completion gets the same answer. "
  + `Do what the refusal asks -- test that revision again, or change the subflow, submit it with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID} and test the new revision. ${HONEST_ENDING}`;

/** The partial verdict a test call answered, when it ran a trial: a refused call (wrong receipt, retest limit) ran none. */
function answeredTrial(answered: Awaited<ReturnType<AutomationStudioSubflowTrialGate["test"]>>, gate: AutomationStudioSubflowTrialGate): AutomationStudioSubflowTrialResult | undefined {
  const evidence = answered.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || evidence.partial !== true) return undefined;
  const { revision, digest } = evidence;
  return typeof revision === "number" && typeof digest === "string" ? gate.standing({ revision, digest }) : undefined;
}

function endingRefused(code: string, instruction: string): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction } };
}

/** The subflow an accepted proposal is, as the model sent it, labelled by its revision and digest, in words that stay true (t498, t503). */
function acceptedScript(sent: JsonObject, proposal: Readonly<AutomationStudioSubflowProposal>): JsonObject {
  const said = `Revision ${proposal.revision} (digest ${proposal.digest}) of this subflow, as Core accepted it`;
  if (typeof sent.flow === "string") return { script: sent.flow, scriptIs: `${said}: script is its whole text.` };
  if (sent.plan !== undefined) return { plan: sent.plan, scriptIs: `${said}: plan is its whole JSON plan.` };
  return {};
}

/** What an accepted proposal says of the handed-on inputs no line of it reads (header, t672): that it stands as it is, and the supervisor is told. */
function unneededNote(proposal: Readonly<AutomationStudioSubflowProposal>): JsonObject {
  const names = proposal.unneededInputs ?? [];
  if (!names.length) return {};
  const quoted = names.map((name) => `"${name}"`).join(", ");
  return { note: `No line of this subflow reads ${names.length === 1 ? `the input ${quoted}` : `the inputs ${quoted}`}, which another subflow hands on: this subflow does not need ${names.length === 1 ? "it" : "them"}, so this revision stands as it is and the supervisor is told. Keep the \`input:\` ${names.length === 1 ? "line" : "lines"}, since the plan gives the value.` };
}
