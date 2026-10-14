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
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CANDIDATE_WRAP_UP_DECISIONS, runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceCompletionCheck, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT, AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT } from "../plan/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY } from "../../llm/decision-handlers/index.ts";
import { automationStudioCandidateSubmissionRefusal } from "../candidate/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialResult } from "./contracts.ts";
import { automationStudioSubflowBuilderTools } from "./role-tools.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "./scoped-submission.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowTrialPreparingPort } from "./subflow-trial-gate.ts";

/** The builder's submit tool. */
export const AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID = "core.submit_subflow";

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
  ended?: { outcome: "blocked" | "partial"; reason: string } | undefined;
  lastTrial?: AutomationStudioSubflowTrialResult | undefined;
  promotionAllowed: false;
};

/**
 * What the submit tool says of the subflow's success check (t569). A scope
 * with one: it is the plan's, as before, byte for byte. A scope with none --
 * the plan the project supervisor writes gives none -- proposing one is the
 * builder's, in the script's own `done when:` terms
 * (`../plan/flow-script-format.ts`): where the line goes for this kind of
 * subflow, and that it becomes the subflow's check, which its trial is judged
 * against (`./scoped-submission.ts`, `../../service/subflow-trial/run.ts`).
 */
function successCheckRule(scope: AutomationStudioSubflowScope): string {
  if (scope.successCheck !== undefined) return "Its success check is the plan's; leave out `done when:` for it or write exactly that.";
  const where = scope.interface ? `inside its own \`part ${scope.subflowKey}:\` block, before its first step` : "outside every block, after its last step";
  return `The plan gives it no success check, so propose one with it: a \`done when: <fact>\` line ${where}, saying what the page shows once it worked, for example \`done when: text t11 contains "Booked"\`. `
    + "It becomes this subflow's success check, and its trial is judged against it.";
}

/**
 * The brief, as the submit tool says it (header, t570): the parts this subflow
 * does, in the person's own words, and how it is written -- for a callable
 * subflow the exact `part`, `input:` and `output:` lines, by the names its
 * interface gives, which is what the scoped submission holds it to
 * (`./callable-target.ts`).
 */
function briefWords(scope: AutomationStudioSubflowScope): string {
  const key = scope.subflowKey;
  const parts = scope.parts.map((part) => `"${part.text}"`).join("; ");
  const own = `Your brief is the subflow "${key}" alone. It does only ${scope.parts.length === 1 ? "this part" : "these parts"} of the task: ${parts}. Any other part of the task is another builder's subflow: write none of its steps here.${alreadyDone(scope)}`;
  const contract = scope.interface;
  if (!contract) return `${own} The router runs it, so it takes no inputs and hands back no outputs: write its steps outside every block, and any helper it needs as a part those steps call.`;
  const inputs = contract.inputs.map((port) => port.id);
  const outputs = contract.outputs.map((port) => port.id);
  const lines = [`part ${key}: <what it does>`, ...inputs.map((name) => `  input: ${name}`), ...outputs.map((name) => `  output: ${name} = $step.<label>.<output>`), "  step <label>: <what it does>", "    node: ...", "end"];
  const given = inputs.length ? `is given exactly ${names(inputs)}` : "is given no value";
  const handed = outputs.length ? `hands back exactly ${names(outputs)}` : "hands back no value";
  return `${own} Other subflows call it: it ${given} and ${handed}. So write it as one part with exactly these lines, its steps inside, and nothing outside every block:\n${lines.join("\n")}\n`
    +(outputs.length ? "Each output line names one of the part's own steps by its label and the output it binds. " : "")
    + "Any helper it needs is a further part it calls.";
}

/**
 * What a dependent builder is told of its part already done at its entry
 * (header, t594): nothing for a scope with no predecessors.
 */
function alreadyDone(scope: AutomationStudioSubflowScope): string {
  if (!scope.predecessors.length) return "";
  return ` ${scope.predecessors.length === 1 ? "The subflow" : "The subflows"} ${names(scope.predecessors)} ${scope.predecessors.length === 1 ? "runs" : "run"} before it and ${scope.predecessors.length === 1 ? "leaves" : "leave"} the page where it starts. `
    + "If the page there already shows what one of its parts asks as done, a subflow before it did that part: write no step for it, and if nothing of this brief is left to do, "
    + `end the brief: complete with {"ended": "blocked", "reason": "<which part is already done, and which subflow did it>"}, so the plan can change.`;
}

function names(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

export async function runAutomationStudioSubflowBuilderLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly" | "callScope" | "finishingTools">;
  scope: AutomationStudioSubflowScope;
  siblings: ScopedInput["siblings"];
  submission: ScopedInput["submission"];
  /** The partial-trial port, and the site reset its gate asks before each trial (`./subflow-trial-gate.ts`, t578). */
  trial?: { port: AutomationStudioSubflowTrialPreparingPort; reset?: AutomationStudioSiteResetTrialReset | undefined } | undefined;
  /** Suffixes the opening call's id; passed only when builders of one Flow may run at once (header). */
  callScope?: string | undefined;
  /** Told each proposal Core accepted, so a caller whose loop then fails still knows the latest one. */
  accepted?: ((proposal: Readonly<AutomationStudioSubflowProposal>) => void) | undefined;
  /** Wraps the loop's input before it runs, as the candidate loop's `observe` does. */
  observe?: ((loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput) | undefined;
}): Promise<AutomationStudioSubflowBuilderOutcome> {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const submission: ScopedInput["submission"] = signal ? { ...input.submission, signal } : input.submission;
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope: input.scope, siblings: input.siblings, submission });
  const gate = new AutomationStudioSubflowTrialGate({ scope: input.scope, latest: () => controller.latest(), port: input.trial?.port, signal, ...(input.trial?.reset ? { reset: input.trial.reset } : {}) });
  const subflowKey = input.scope.subflowKey;
  let tried = false;
  let lastTrial: AutomationStudioSubflowTrialResult | undefined;
  let ended: AutomationStudioSubflowBuilderOutcome["ended"];
  const submitTool: AutomationStudioLlmEvidenceTool = {
    toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, effect: "observe",
    description: `Submit your subflow "${subflowKey}", written as a Flow script under "flow"${input.scope.interface ? "" : `, or a JSON plan under "plan"`}. The description of "flow" opens with your brief -- the parts of the task this subflow does, in the person's words, and how it is written -- then gives the format and examples: hold whatever you submit to that brief. Write no \`when:\` line and no other subflow: which situation runs which subflow is the structure plan's. ${successCheckRule(input.scope)} Static validity returns a draft revision and digest, never acceptance. Correct every diagnostic and resubmit the whole subflow. Then test that exact revision with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}, and complete with the subflowKey, revision and digest only after its trial answers yes. ${HONEST_ENDING}`,
    inputSchema: { type: "object", properties: { flow: { type: "string", description: `${briefWords(input.scope)}\nThis subflow as a script. ${AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT}\n${AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT}` }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
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
  // An honest ending (header): its shape, then only once something was tried and while no yes stands for the latest proposal.
  const endingCheck = (result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck => {
    const reason = typeof result.reason === "string" ? result.reason.trim() : "";
    if (!ENDING_OUTCOMES.has(result.ended) || !reason || Object.keys(result).some((key) => key !== "ended" && key !== "reason")) {
      return endingRefused(ENDING_SHAPE, "An honest ending is exactly {\"ended\": \"blocked\", \"reason\": \"<why, in a sentence>\"}, or \"partial\" in place of \"blocked\" while a proposal stands, and nothing else.");
    }
    // A dependent builder may find its part already done at its entry, with nothing to submit (header, t594).
    if (!tried && !(result.ended === "blocked" && input.scope.predecessors.length)) return endingRefused(ENDING_TOO_SOON, `Nothing of this brief has been submitted or tried yet, so there is nothing to end on. Submit the subflow with ${AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID}${gate.available ? ` and test it with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID}` : ""} first.`);
    const proposal = controller.latest();
    const standing = gate.standing(proposal);
    if (proposal && standing?.verdict === "yes" && standing.entryPrepared) {
      return endingRefused(ENDING_AFTER_YES, `Revision ${proposal.revision} of this subflow passed its trial, so the brief is done: complete with exactly {"subflowKey": ${JSON.stringify(subflowKey)}, "revision": ${proposal.revision}, "digest": "${proposal.digest}"}.`);
    }
    ended = { outcome: result.ended as "blocked" | "partial", reason: reason.slice(0, MAX_ENDING_REASON) };
    return { ok: true };
  };
  const checkCompletion: NonNullable<AutomationStudioLlmEvidenceLoopInput["checkCompletion"]> = async (result) => {
    // Any key a receipt does not have makes it an ending, however written: the trial gate's own words say "complete with outcome blocked".
    const check = await (Object.keys(result).some((key) => !RECEIPT_KEYS.has(key)) ? endingCheck(result) : receiptCheck(result));
    // A refusal sent again is said in a builder's terms (header).
    return check.ok || !check.feedback ? check : { ...check, feedback: { ...check.feedback, [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY]: BUILDER_SENT_AGAIN } };
  };
  const discovery: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop, draft: false, dryRun: false, discoveryOnly: true,
    // Its turns, its allowance's dollars and its calls, less its finishing trials' judges (header, t570).
    budget: { ...(input.loop.budget ?? {}), countCalls: { keptForFinishing: AUTOMATION_STUDIO_SUBFLOW_FINISHING_JUDGE_CALLS } },
    finishingTools: { submit: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, test: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID },
    tools: [...automationStudioSubflowBuilderTools(input.loop.tools), submitTool, gate.tool],
    // The receipt of the latest proposal, or an honest ending (header).
    completionSchema: { type: "object", properties: { subflowKey: { type: "string", const: subflowKey }, revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string" } }, additionalProperties: false },
    executeTool: async (call) => {
      if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID) {
        const answered = await gate.test(call.value, call.signal);
        const trial = answeredTrial(answered, gate);
        if (trial) {
          tried = true;
          lastTrial = trial;
        }
        return answered;
      }
      if (call.toolId !== AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID) return input.loop.executeTool(call);
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
        next: gate.available
          ? `Test next with ${AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID} using exactly {"revision": ${submitted.proposal.revision}, "digest": "${submitted.proposal.digest}"}. Do not complete until that exact revision's trial answers yes. Submitting again makes a new revision that needs its own trial.`
          : "No subflow trial runner is available here; completing leaves an untried proposal."
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
