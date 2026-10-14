import { runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioHostLeaseScope, AutomationStudioHostResourceLease } from "../host-resources/index.ts";
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

type Role = "builder" | "repair";

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
  const accepted = (proposal: Readonly<AutomationStudioSubflowProposal>) => {
    spend.accepted = proposal;
  };
  const outcome = await untilEnded(signal, ports.ended, (stop) => runBuilder({
    loop: { ...ports.loop, maxIterations: brief.maxIterations, signal: stop, purse: allowance },
    scope: mapped.scope,
    siblings: mapped.siblings,
    submission: { ...ports.submission, signal: stop },
    ...(ports.trial ? { trial: { port: receipts.wrap(ports.trial) } } : {}),
    ...(callScope !== undefined ? { callScope } : {}),
    ...(ports.observe ? { observe: ports.observe } : {}),
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
