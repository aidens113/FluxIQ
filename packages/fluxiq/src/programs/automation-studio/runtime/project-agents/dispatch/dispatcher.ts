import type { AutomationStudioProjectBuilderReturn } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildRecordView } from "../record/index.ts";
import { automationStudioProjectDispatchDependencies } from "./dependencies.ts";
import { automationStudioProjectDispatchEnding as ending } from "./ending.ts";
import { automationStudioProjectHostLeaseScope } from "./host-lease.ts";
import type { AutomationStudioProjectDispatchPort } from "./port.ts";
import { runAutomationStudioProjectDispatchBrief } from "./run-brief.ts";
import { automationStudioProjectDispatchScope } from "./scope.ts";
import type { AutomationStudioProjectDispatcherInput } from "./types.ts";

// The dispatcher behind the supervisor's `project.dispatch`
// (automation-project-agents-plan, `Concurrent dispatch`; port in `./port.ts`).
//
// - **Dependency order.** A brief starts once every brief of the dispatch whose
//   subflow its entry names among its predecessors has ended (`./dependencies.ts`),
//   and starts only when each of them came back `done` with a proposal -- the
//   only return whose trial answered yes (`./ending.ts`). A subflow's trial
//   reaches its entry by running its predecessors' passing proposals
//   (`service/project-build/proposals.ts`), so a brief whose predecessor ended
//   `partial`, `blocked`, or `done` with no proposal does not start: every trial
//   it ran would answer `subflow.trial_predecessor_missing`. It ends `blocked`,
//   naming the predecessor and why. A predecessor that is not in this dispatch
//   is read off the build record instead: it counts once an earlier brief of
//   its subflow came back `done` with a proposal, and until then its dependent
//   ends `blocked` at once. Such an earlier pass counts for a predecessor in
//   this dispatch too, as the trial port keeps a subflow's latest passing
//   proposal whatever a later brief of it returns. Briefs in a ring of waits end
//   `blocked` at once.
// - **Concurrency up to the host's capacity.** Briefs whose waits are over ask
//   the one scheduler of the host port for a lease (`./host-lease.ts`) in the
//   order they became ready, given order first; with capacity 1 they run one at
//   a time in that order.
// - **A brief that waited is sized as it starts (t627).** Its allowance is
//   carved when its turn comes, from what the purse can then give, split over
//   it, the briefs of the dispatch not yet carved and the build's finishing, and
//   never above what the dispatch sized it at (`./start-allowance.ts`).
// - **Endings are returns.** Each brief runs in its own child of the
//   supervisor's cancellation scope (`./run-brief.ts`): a builder ending never
//   aborts a sibling, and a Flow cancel or the request's signal stops every
//   builder and every waiter, each ending `blocked` or `partial` as stopped.
//   Every return is written to the build record, one file per brief.
//
// Only a dispatch the record cannot hold is refused before anything runs: a
// brief not recorded, recorded twice in the request, or written against an
// older plan. A failed record write is thrown once every brief has ended, so
// no builder is left running behind the failure.

export function createAutomationStudioProjectDispatcher(input: AutomationStudioProjectDispatcherInput): AutomationStudioProjectDispatchPort {
  return async (request) => {
    const scope = input.cancellation.signal();
    if (!scope) throw new Error("The project dispatcher runs only inside the supervisor's build scope.");
    // A Flow cancel aborts the supervisor's scope; the request's own signal stops this dispatch alone. Either stops every waiter.
    const stop = AbortSignal.any([request.signal, scope]);
    const view = await input.record.store.read(input.record.ref);
    if (!view) throw new AutomationStudioProjectRecordRefusal("project.record_missing", "record.buildId");
    const seen = new Set<string>();
    for (const brief of request.briefs) {
      if (seen.has(brief.briefId)) throw new AutomationStudioProjectRecordRefusal("project.duplicate_brief", "brief.briefId");
      seen.add(brief.briefId);
      if (!view.record.briefs.some((entry) => entry.brief.briefId === brief.briefId)) throw new AutomationStudioProjectRecordRefusal("project.brief_unknown", "brief.briefId");
    }
    const mapped = request.briefs.map((brief) => automationStudioProjectDispatchScope(view.record, brief));
    const { waitsOn, cyclic } = automationStudioProjectDispatchDependencies(request.briefs);
    const earlier = earlierReturns(view);
    const dispatched = new Set(request.briefs.map((brief) => brief.subflowKey));
    const leases = automationStudioProjectHostLeaseScope(input.host);
    const ended = request.briefs.map(() => deferred<AutomationStudioProjectBuilderReturn>());
    // The briefs not yet carved: what a waiting brief's start-time share is split with, beside the build's finishing (header).
    const uncarved = new Set(request.briefs.map((_, index) => index));
    const turn = async (index: number): Promise<AutomationStudioProjectBuilderReturn> => {
      const brief = request.briefs[index]!;
      if (cyclic.has(index)) return ending.notStarted(brief, "This brief and another of the same dispatch each wait for the other's subflow, so neither can start.");
      const absent = brief.entry.predecessors.find((key) => key !== brief.subflowKey && !dispatched.has(key) && !earlier.passed.has(key));
      if (absent !== undefined) {
        const last = earlier.latest.get(absent);
        const why = last ? `its latest brief, ${last.briefId}, ${unpassed(last)}` : "no brief of it has returned in this build";
        return ending.notStarted(brief, `Subflow ${absent}, which this subflow starts after, is not in this dispatch and has no proposal whose trial answered yes: ${why}. So this subflow's entry cannot be prepared and its trials could not run.`);
      }
      const before = await untilEnded(waitsOn[index]!.map((at) => ended[at]!.promise), stop);
      if (before === "stopped") return ending.notStarted(brief, "The build was stopped before this brief's turn came.");
      const settled = new Set(waitsOn[index]!.flatMap((at, position) => (passed(before[position]!) ? [request.briefs[at]!.subflowKey] : [])));
      const unready = waitsOn[index]!.findIndex((at) => {
        const key = request.briefs[at]!.subflowKey;
        return !settled.has(key) && !earlier.passed.has(key);
      });
      if (unready !== -1) {
        const predecessor = request.briefs[waitsOn[index]![unready]!]!;
        return ending.notStarted(brief, `Brief ${predecessor.briefId} for subflow ${predecessor.subflowKey}, which this subflow starts after, ${unpassed(before[unready]!)}, so this subflow's entry cannot be prepared and its trials could not run.`);
      }
      const start = { ...(waitsOn[index]!.length ? { shares: () => uncarved.size + 1 } : {}), carved: () => uncarved.delete(index) };
      return await runAutomationStudioProjectDispatchBrief({ dispatcher: input, brief, mapped: mapped[index]!, leases, stop, start });
    };
    const tasks = request.briefs.map(async (brief, index) => {
      let returned: AutomationStudioProjectBuilderReturn;
      try {
        returned = await turn(index);
      } catch (error) {
        uncarved.delete(index);
        // A record failure: the briefs that wait on this one must not wait forever.
        ended[index]!.resolve(ending.notStarted(brief, "The build record could not be written for this brief."));
        throw error;
      }
      uncarved.delete(index);
      ended[index]!.resolve(returned);
      await input.record.store.recordReturn(input.record.ref, returned);
      return returned;
    });
    const settled = await Promise.allSettled(tasks);
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw failed.reason;
    return { returns: settled.map((result) => (result as PromiseFulfilledResult<AutomationStudioProjectBuilderReturn>).value) };
  };
}

/** A predecessor's return a dependent can start after: done, with the proposal its trial answered yes for. */
function passed(returned: AutomationStudioProjectBuilderReturn): boolean {
  return returned.outcome === "done" && returned.proposal !== undefined;
}

/** The returns earlier dispatches wrote, by subflow: which subflows passed, and each one's latest return. */
function earlierReturns(view: AutomationStudioProjectBuildRecordView): { passed: Set<string>; latest: Map<string, AutomationStudioProjectBuilderReturn> } {
  const subflowOf = new Map(view.record.briefs.map((entry) => [entry.brief.briefId, entry.brief.subflowKey]));
  const passedKeys = new Set<string>();
  const latest = new Map<string, AutomationStudioProjectBuilderReturn>();
  for (const entry of [...view.returns].sort((a, b) => a.recordedAt - b.recordedAt)) {
    const key = subflowOf.get(entry.briefId);
    if (key === undefined) continue;
    latest.set(key, entry.builderReturn);
    if (passed(entry.builderReturn)) passedKeys.add(key);
  }
  return { passed: passedKeys, latest };
}

/** Why a predecessor's return holds its dependents back, in plain words, with its own reason. */
function unpassed(returned: AutomationStudioProjectBuilderReturn): string {
  const why = returned.outcome === "done"
    ? "ended done without a proposal of its subflow"
    : returned.outcome === "partial"
      ? returned.proposal
        ? `ended partial: its revision ${returned.proposal.revision} stands, but no trial of it answered yes`
        : "ended partial with no proposal of its subflow"
      : "ended blocked";
  return `${why} (${clipped(returned.reason)})`;
}

const MAX_PREDECESSOR_REASON = 600;

function clipped(reason: string): string {
  return reason.length > MAX_PREDECESSOR_REASON ? `${reason.slice(0, MAX_PREDECESSOR_REASON - 3)}...` : reason;
}

/** The predecessors' returns once all have ended, or `"stopped"` when the signal aborts first. */
async function untilEnded(waits: Array<Promise<AutomationStudioProjectBuilderReturn>>, signal: AbortSignal): Promise<AutomationStudioProjectBuilderReturn[] | "stopped"> {
  if (!waits.length) return [];
  if (signal.aborted) return "stopped";
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<"stopped">((resolve) => {
    onAbort = () => resolve("stopped");
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.all(waits), stopped]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
