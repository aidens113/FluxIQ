import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPort, type AutomationStudioSubflowTrialPreparingPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import { automationStudioProjectSubflowBrief, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectFailingTrial, type AutomationStudioProjectReceiptRef, type AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioHostLeaseScope, AutomationStudioHostResourceLease } from "../host-resources/index.ts";
import { AutomationStudioProjectAcceptedSubflows } from "./accepted-subflows.ts";
import { automationStudioProjectDispatchEnding as ending, type AutomationStudioProjectDispatchSpend } from "./ending.ts";
import { AutomationStudioProjectDispatchReceipts } from "./receipts.ts";
import { runAutomationStudioProjectResetLoop } from "./reset-loop.ts";
import type { AutomationStudioProjectDispatchScope } from "./scope.ts";
import type { AutomationStudioProjectBriefEnding, AutomationStudioProjectDispatcherInput } from "./types.ts";

// One brief, from its turn to its return (automation-project-agents-plan,
// `Concurrent dispatch`): a child of the supervisor's cancellation scope, then
// a host lease (waiting for one costs no model calls), then an allowance carved
// from the build's purse, recorded as soon as it is carved, then the builder's
// loop under the brief's attribution and inside the allowance's purse scope,
// so its decisions and its subflow trials' judges are all the brief's spend.
// The allowance is closed when the brief ends, however it ends, and what it
// left goes back to the purse.
//
// Every ending is a return. Only a failed write to the build record is not:
// it is the record's failure, not the builder's, and it is thrown.
//
// **A brief's own ending stops its loop.** The ports a brief is given may
// carry its permission and person-needed ending (`ended`): a plan step the
// person did not permit, refused inside the submission's completion check the
// loop cannot see into, or a check only a person could pass. Its signal joins
// the loop's own, so the loop stops at its next turn instead of asking the
// model again for what no answer can fix, and the brief comes back `blocked`
// with the ending's reason, whatever proposal it had (t551) -- except a reset
// that left nothing of the build in place, which did its one job and is
// `done`. The build's own cancellation is not this: a stopped build ends every
// brief as stopped.
//
// **A repair builder is shown what failed (bigbox debug fix 2, t595).** Bigbox
// `run-mv8c7unr-42a8456d` sent eight repairs whose builders were never told
// which trial they were repairing, and each wrote the same steps again. A
// repair brief's opening look now carries, beside what the page shows,
// `repairOf`: the receipt it names and that trial's verdict, the step it
// stopped at and what it said (`contracts/subflow-brief.ts`, `failingTrial`).
// The supervisor puts the whole test's on the brief; a subflow trial's is the
// one this dispatcher saw its builder run, kept for the build by receipt id
// (`TRIALS`), as the brief's receipts name it (`./receipts.ts`). A receipt
// whose trial is not held -- one run before this process, say -- is named as
// such, so the builder is never told a failure it cannot see.
//
// **A pass the run rescued is shown as what to answer (social debug, t603).**
// A whole test that passed only because the run recovered by itself where the
// site asked it to slow down reaches a repair as a `yes` with `interruptions`
// (`contracts/subflow-brief.ts`): each step it recovered at, from the trial's
// step record, and what the Flow needs there. Its builder is shown them with
// how to add the pace and the dismiss-wait-and-return branch, rather than
// told the trial passed and nothing failed.
//
// **A throw after a standing yes is done (t611).** The last trial the brief's
// port answered is kept on its spend (`heard`) beside the latest proposal Core
// accepted, so a builder whose loop throws is held to the check a returned
// loop is (`./ending.ts`): done on a yes of exactly that proposal, its entry
// prepared; otherwise the return it always had, its failure said first.
//
// **A repair builder is shown the subflow it repairs (A8 social
// `run-mv96rz6h`, t622).** A repair of a passing subflow was told to keep every
// other step as it was, yet saw a blank Flow and rewrote the subflow from
// nothing with handles it had never been shown. Every proposal Core accepts
// for a brief of the build is kept with the script its builder sent
// (`./accepted-subflows.ts`, `ACCEPTED`), and `repairOf` carries `yourSubflow`:
// the proposal the failing subflow trial ran when it is held, else the latest
// done return's proposal of that subflow (the plan in force first) as the build
// record names it -- its script, its steps as Core resolved them (what each
// handle stood for on the page its builder saw), and how to keep them. One the
// build does not hold is named as such.

type Role = "builder" | "repair";

/** The most subflow trials one build's memory keeps, the latest first kept. */
const MAX_TRIALS_KEPT = 200;
/** The key a repair's failing trial is shown under, beside the opening look's evidence. */
const REPAIR_KEY = "repairOf";
const REPAIR_NOTE = "This brief repairs your subflow after the trial named here did not pass: its verdict, the step it stopped at (failedStep: its number, label, node, failure code and what happened) and the rest of what its run and its judge said (said). "
  + "A whole test's step numbers count every step of the whole Flow in order, not only yours; its label names the step. Find what in your subflow made that happen, change it, submit and test it. "
  + "A proposal that does exactly what the one before did changes nothing, and the supervisor is told so. If the failure is not in a step of yours -- the run stopped before your subflow, or started somewhere your subflow does not start -- end the brief blocked and say which.";
const REPAIR_UNHELD_NOTE = "This brief repairs your subflow after the trial named here did not pass, but what that trial said is not held here. Look at what your subflow's steps meet on the page now, change what does not work, submit and test it; "
  + "a proposal that does exactly what the one before did changes nothing, and the supervisor is told so.";
const REPAIR_RESCUED_NOTE = "This brief repairs your subflow after the trial named here passed only because the run recovered by itself where the site asked it to slow down: the run waited, tried the step again or closed the site's notice, and the Flow has no step that does that. "
  + "Under interruptions is each step where it happened: its number and label (a whole test's step numbers count every step of the whole Flow in order, not only yours), what the run met and how it recovered (absorbed, interruptions, learned), and what the Flow needs there (needs). "
  + "Answer it in your subflow: give the span that repeats that step a `repeat pace:` of at least needs.paceAtLeastMs on its first step; where needs names a wayOut, add right after that step, inside the span, an `optional: yes` step that presses the notice's way out, and directly after it a `builtin.timing.wait` step with `only after:` naming it that waits at least needs.waitAtLeastMs, so a pass that meets the notice dismisses it, waits and goes on with the loop. "
  + "wayOut is the handle the trial's page gave that control; find the same control on your page. Keep every other step as it is, then submit and test. If that step is not in your subflow, end the brief blocked and say which.";
const REPAIR_PASSED_NOTE ="This brief repairs your subflow, but the trial named here passed, so it says nothing about what to change. Look at what your subflow's steps meet on the page now; "
  + "if they still do what your parts ask, end the brief blocked and say that nothing in this subflow failed, rather than write the same steps again.";

/**
 * Every subflow trial a brief of one build ran, by its receipt id: the
 * dispatcher's input is made once per build, so this lives exactly as long as
 * the build's dispatcher (header).
 */
const TRIALS = new WeakMap<AutomationStudioProjectDispatcherInput, Map<string, { ref: AutomationStudioProjectReceiptRef; trial: AutomationStudioProjectFailingTrial | undefined; ran: ProposalRef }>>();

/** A proposal as the build names it: the brief that made it, its revision and its digest. */
type ProposalRef = { briefId: string; revision: number; digest: string };

/** Every proposal Core accepted for a brief of one build, kept as long as the build's dispatcher (header). */
const ACCEPTED = new WeakMap<AutomationStudioProjectDispatcherInput, AutomationStudioProjectAcceptedSubflows>();
const YOUR_SUBFLOW_NOTE = "yourSubflow is your subflow as Core accepted it before this brief, at the revision it names: script is the whole text its builder sent, and steps are its steps as Core resolved them, each handle the script names (tN, extraction.N) there replaced by what it stood for on the page that builder saw. "
  + "Those handles came from that builder's looks, not yours, so the check knows none of them: find the same controls and reads on your own page and write the handles your looks give. Start from this script, change only what this repair asks, and keep every other step as it is.";
const YOUR_SUBFLOW_UNHELD_NOTE = "yourSubflow names the revision of your subflow Core accepted before this brief, but its script is not held here. Look at what your subflow's steps meet on the page now and write the whole subflow, changing only what this repair asks.";

/** What a return's reason may hold (`contracts/builder-return.ts`). */
const MAX_REASON = 2000;
/** A reset's `done`, as `./ending.ts` words it. */
const RESET_DONE = "Every lasting act this build made is undone; the site is as the build found it.";

/** A failed build-record write, carried past the brief's own catch. */
class RecordWriteFailure extends Error {
  constructor(readonly error: unknown) {
    super("A build record write failed.");
    this.name = "RecordWriteFailure";
  }
}

export async function runAutomationStudioProjectDispatchBrief(input: {
  dispatcher: AutomationStudioProjectDispatcherInput;
  brief: AutomationStudioProjectSubflowBrief;
  mapped: AutomationStudioProjectDispatchScope;
  leases: AutomationStudioHostLeaseScope;
  /** The dispatch request's signal: aborting it stops every brief of the dispatch. */
  stop: AbortSignal;
}): Promise<AutomationStudioProjectBuilderReturn> {
  const { dispatcher, brief, mapped, leases, stop } = input;
  if (brief.kind === "survey") return ending.notStarted(brief, "Survey briefs are not run by the dispatcher yet, so nothing was explored.");
  const role: Role = brief.kind === "repair" ? "repair" : "builder";
  const receipts = new AutomationStudioProjectDispatchReceipts(brief.briefId);
  const spend: AutomationStudioProjectDispatchSpend = { allowance: undefined, trials: [] };
  try {
    return await dispatcher.cancellation.child(async () => {
      const signal = dispatcher.cancellation.signal()!;
      return await leases.run({ role, briefId: brief.briefId }, async (lease) => {
        const maxCalls = dispatcher.maxCalls ? dispatcher.maxCalls(brief) : brief.maxIterations;
        // A reset is the build's own finishing, so it may be carved from the calls kept back for it (t570).
        const carved = dispatcher.purse.allowance({ role, briefId: brief.briefId, usd: brief.allowanceUsd, ...(maxCalls !== undefined ? { maxCalls } : {}), ...(brief.kind === "reset" ? { fromKeptBack: true } : {}) });
        if (!carved.ok) {
          const { refusal } = carved;
          const calls = refusal.requestedCalls !== undefined && refusal.allocatableCalls !== undefined ? ` and ${refusal.requestedCalls} calls: ${refusal.allocatableCalls} calls could still be allotted` : "";
          return ending.notStarted(brief, `The build's purse could not carve this brief's allowance of $${refusal.requestedUsd.toFixed(4)}${calls}; $${refusal.allocatableUsd.toFixed(4)} could still be allotted.`);
        }
        spend.allowance = carved.allowance;
        await recorded(() => dispatcher.record.store.recordAllowance(dispatcher.record.ref, { role, briefId: brief.briefId, usd: brief.allowanceUsd }));
        const allowance = carved.allowance;
        const agent = { role, briefId: brief.briefId, subflowName: mapped.subflowName };
        return await withAutomationStudioProjectAgent(agent, () => automationStudioLlmBuildPurseScope(allowance, () => run({ ...input, lease, signal, allowance, receipts, spend })));
      }, { signal });
    }, stop);
  } catch (error) {
    const failure = recordFailureOf(error);
    if (failure) throw failure.error;
    return ending.thrown(brief, error, stop.aborted || isAbort(error), { ...spend, trials: receipts.list() });
  } finally {
    spend.allowance?.close();
  }
}

async function run(input: {
  dispatcher: AutomationStudioProjectDispatcherInput;
  brief: AutomationStudioProjectSubflowBrief;
  mapped: AutomationStudioProjectDispatchScope;
  leases: AutomationStudioHostLeaseScope;
  lease: AutomationStudioHostResourceLease;
  signal: AbortSignal;
  allowance: AutomationStudioLlmBuildPurse;
  receipts: AutomationStudioProjectDispatchReceipts;
  spend: AutomationStudioProjectDispatchSpend;
}): Promise<AutomationStudioProjectBuilderReturn> {
  const { dispatcher, brief, mapped, lease, signal, allowance, receipts, spend } = input;
  // Only a host that runs several agents at once needs the opening call scoped (`flow-bootstrap/subflow-candidate/builder-loop.ts`).
  const callScope = input.leases.scheduler.capacity > 1 ? brief.briefId : undefined;
  const request = { brief, scope: mapped.scope, ledger: dispatcher.ledger.forBrief(brief.briefId), lease, signal };
  if (brief.kind === "reset") {
    const ports = await dispatcher.ports.reset(request);
    const remainingActs = ports.remainingActs ?? (async () => dispatcher.ledger.snapshot().acts.filter((act) => act.inPlace).map((act) => ({ act: act.act, did: act.did })));
    const loop = await untilEnded(signal, ports.ended, (stop) => runAutomationStudioProjectResetLoop({ brief, ports, remainingActs, allowance, signal: stop, callScope }));
    if ("ended" in loop) {
      // A reset that left nothing of the build in place did its one job, however its loop was stopped.
      if (!(await remainingActs()).length) return endedAs(brief, "done", RESET_DONE, { ...spend, trials: receipts.list() });
      return endedAs(brief, "blocked", loop.ended, { ...spend, trials: receipts.list() });
    }
    return ending.reset(brief, loop.ran, await remainingActs(), { ...spend, trials: receipts.list() });
  }
  const ports = await dispatcher.ports.builder(request);
  const runBuilder = dispatcher.runBuilder ?? runAutomationStudioSubflowBuilderLoop;
  const held = acceptedOf(dispatcher);
  const accepted = (proposal: Readonly<AutomationStudioSubflowProposal>) => {
    spend.accepted = proposal;
    held.accepted(proposal);
  };
  // Each script Core accepts is read off the submit tool's answer, then the ports' own observer wraps the loop (header).
  const observe = (observed: AutomationStudioLlmEvidenceLoopInput) => {
    const watched = held.watch(brief.briefId, observed);
    return ports.observe ? ports.observe(watched) : watched;
  };
  const repair = await repairOf(dispatcher, brief);
  const loop = repair ? shownAtOpening(ports.loop, repair) : ports.loop;
  const outcome = await untilEnded(signal, ports.ended, (stop) => runBuilder({
    loop: { ...loop, maxIterations: brief.maxIterations, signal: stop, purse: allowance },
    scope: mapped.scope,
    siblings: mapped.siblings,
    submission: { ...ports.submission, signal: stop },
    ...(ports.trial ? { trial: { port: kept(ports.trial, heard(spend, remembered(dispatcher, receipts, receipts.wrap(ports.trial)))), ...(ports.reset ? { reset: ports.reset } : {}) } } : {}),
    ...(callScope !== undefined ? { callScope } : {}),
    observe,
    accepted
  }));
  if ("ended" in outcome) return endedAs(brief, "blocked", outcome.ended, { ...spend, trials: receipts.list() });
  return ending.built(brief, outcome.ran, { ...spend, trials: receipts.list() });
}

/**
 * Runs `work` under the brief's signal joined with its own ending's. When the
 * ending fired and the build was not stopped, the brief ended on it, whether
 * the loop then returned or threw; otherwise the loop's own result stands.
 */
async function untilEnded<T>(signal: AbortSignal, ended: AutomationStudioProjectBriefEnding | undefined, work: (stop: AbortSignal) => Promise<T>): Promise<{ ran: T } | { ended: string }> {
  if (!ended) return { ran: await work(signal) };
  const own = () => (ended.signal.aborted && !signal.aborted ? ended.reason() ?? "The brief needed the person, and the person's answer did not let it go on." : undefined);
  let ran: T;
  try {
    ran = await work(AbortSignal.any([signal, ended.signal]));
  } catch (error) {
    const reason = own();
    if (reason !== undefined) return { ended: reason };
    throw error;
  }
  const reason = own();
  return reason !== undefined ? { ended: reason } : { ran };
}

/** `wrapped` keeping `port`'s start hook ahead of the gate's reset (`prepareStart`, t578), which a wrapper would otherwise drop. */
function kept(port: AutomationStudioSubflowTrialPreparingPort, wrapped: AutomationStudioSubflowTrialPreparingPort): AutomationStudioSubflowTrialPreparingPort {
  if (port.prepareStart) wrapped.prepareStart = port.prepareStart;
  return wrapped;
}

/** `port`, keeping each trial it answers in the build's memory under the receipt id its brief's receipts gave it (header). */
function remembered(dispatcher: AutomationStudioProjectDispatcherInput, receipts: AutomationStudioProjectDispatchReceipts, port: AutomationStudioSubflowTrialPort): AutomationStudioSubflowTrialPort {
  return async (request) => {
    const result = await port(request);
    const ref = receipts.list().at(-1);
    if (ref) {
      const held = TRIALS.get(dispatcher) ?? new Map();
      TRIALS.set(dispatcher, held);
      held.set(ref.receiptId, { ref, trial: automationStudioProjectSubflowBrief.failingTrial(result), ran: { briefId: result.identity.briefId, revision: result.revision, digest: result.digest } });
      while (held.size > MAX_TRIALS_KEPT) held.delete(held.keys().next().value!);
    }
    return result;
  };
}

/** `port`, keeping the last trial it answered on the brief's spend, for a builder whose loop then throws (header, t611). */
function heard(spend: AutomationStudioProjectDispatchSpend, port: AutomationStudioSubflowTrialPort): AutomationStudioSubflowTrialPort {
  return async (request) => {
    const result = await port(request);
    spend.trial = structuredClone(result);
    return result;
  };
}

/** What a repair brief's builder is shown of the trial it repairs and of the subflow it repairs (header); undefined for any other brief. */
async function repairOf(dispatcher: AutomationStudioProjectDispatcherInput, brief: AutomationStudioProjectSubflowBrief): Promise<JsonObject | undefined> {
  const receipt = brief.failingReceipt;
  if (brief.kind !== "repair" || !receipt) return undefined;
  const named: JsonObject = { kind: receipt.kind, receiptId: receipt.receiptId };
  const held = receipt.kind === "subflow_trial" ? TRIALS.get(dispatcher)?.get(receipt.receiptId) : undefined;
  const seen = held?.ref.digest === receipt.digest ? held : undefined;
  const trial = brief.failingTrial ?? seen?.trial;
  const yours = await yourSubflow(dispatcher, brief, seen?.ran);
  const subflow = yours ? { yourSubflow: yours } : {};
  if (trial) return { receipt: named, ...structuredClone(trial), note: trial.verdict === "yes" ? REPAIR_RESCUED_NOTE : REPAIR_NOTE, ...subflow };
  return seen ? { receipt: named, verdict: "yes", note: REPAIR_PASSED_NOTE, ...subflow } : { receipt: named, note: REPAIR_UNHELD_NOTE, ...subflow };
}

/**
 * The subflow a repair repairs, as Core accepted it (header): the proposal the
 * failing subflow trial ran (`ran`) when the build holds it, else the latest
 * done return's proposal of the subflow. Undefined when no brief of it came
 * back done with one.
 */
async function yourSubflow(dispatcher: AutomationStudioProjectDispatcherInput, brief: AutomationStudioProjectSubflowBrief, ran: ProposalRef | undefined): Promise<JsonObject | undefined> {
  const held = ACCEPTED.get(dispatcher);
  const ref = (ran && held?.find(ran) ? ran : undefined) ?? (await latestDone(dispatcher, brief));
  if (!ref) return undefined;
  const found = held?.find(ref);
  if (!found) return { revision: ref.revision, digest: ref.digest, note: YOUR_SUBFLOW_UNHELD_NOTE };
  const steps = found.proposal.subflows.map((subflow) => ({ subflow: subflow.key, nodes: subflow.nodes.map((node) => ({ key: node.key, node: node.definitionId, ...(node.parameters ? { parameters: structuredClone(node.parameters) } : {}) })) }));
  const text = found.script !== undefined ? { script: found.script } : found.plan !== undefined ? { plan: structuredClone(found.plan) } : {};
  return { revision: ref.revision, digest: ref.digest, ...text, steps, note: YOUR_SUBFLOW_NOTE };
}

/** The latest done return's proposal of `brief`'s subflow from an earlier brief, the plan in force first, as the build record names it. */
async function latestDone(dispatcher: AutomationStudioProjectDispatcherInput, brief: AutomationStudioProjectSubflowBrief): Promise<ProposalRef | undefined> {
  const view = await dispatcher.record.store.read(dispatcher.record.ref);
  if (!view) return undefined;
  const briefs = new Map(view.record.briefs.map((entry) => [entry.brief.briefId, entry.brief]));
  const done = [...view.returns].sort((left, right) => left.recordedAt - right.recordedAt).flatMap((entry) => {
    const earlier = briefs.get(entry.briefId);
    const proposal = entry.builderReturn.proposal;
    if (!earlier || earlier.briefId === brief.briefId || earlier.subflowKey !== brief.subflowKey || (earlier.kind !== "build" && earlier.kind !== "repair")) return [];
    return entry.builderReturn.outcome === "done" && proposal ? [{ ref: { briefId: earlier.briefId, revision: proposal.revision, digest: proposal.digest }, planDigest: earlier.planDigest }] : [];
  });
  return (done.filter((entry) => entry.planDigest === brief.planDigest).at(-1) ?? done.at(-1))?.ref;
}

/** The build's memory of accepted proposals, made with its dispatcher's first brief (header). */
function acceptedOf(dispatcher: AutomationStudioProjectDispatcherInput): AutomationStudioProjectAcceptedSubflows {
  const found = ACCEPTED.get(dispatcher);
  if (found) return found;
  const made = new AutomationStudioProjectAcceptedSubflows();
  ACCEPTED.set(dispatcher, made);
  return made;
}

type Execute = AutomationStudioLlmEvidenceLoopInput["executeTool"];

/** `loop`, its opening look answered with `said` beside its evidence under `repairOf` (header). */
function shownAtOpening<L extends { executeTool: Execute }>(loop: L, said: JsonObject): L {
  const inner = loop.executeTool;
  const executeTool: Execute = async (call) => {
    const ran = await inner(call);
    if (!isOpeningCall(call.callId)) return ran;
    if (isExecution(ran)) return { ...ran, evidence: isObject(ran.evidence) ? { ...ran.evidence, [REPAIR_KEY]: said } : { [REPAIR_KEY]: said, evidence: ran.evidence } };
    return isObject(ran) ? { ...ran, [REPAIR_KEY]: said } : { [REPAIR_KEY]: said, evidence: ran };
  };
  return { ...loop, executeTool };
}

function isExecution(ran: unknown): ran is AutomationStudioLlmEvidenceToolExecutionResult {
  return isObject(ran) && ran.kind === "llm_evidence_tool_execution";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** A brief its own ending stopped: `blocked` with that ending's reason (a reset that left nothing in place, `done`), any proposal it had still named. */
function endedAs(brief: AutomationStudioProjectSubflowBrief, outcome: "done" | "blocked", reason: string, spend: AutomationStudioProjectDispatchSpend): AutomationStudioProjectBuilderReturn {
  const returned = ending.thrown(brief, undefined, false, spend);
  return { ...returned, outcome, reason: reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 3)}...` : reason };
}

async function recorded(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    throw new RecordWriteFailure(error);
  }
}

/** The record failure behind `error`, including one the cancellation scope rewrapped as a stop. */
function recordFailureOf(error: unknown): RecordWriteFailure | undefined {
  if (error instanceof RecordWriteFailure) return error;
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  return cause instanceof RecordWriteFailure ? cause : undefined;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
