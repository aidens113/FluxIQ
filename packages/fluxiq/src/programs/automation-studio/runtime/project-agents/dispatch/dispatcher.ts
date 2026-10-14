import type { AutomationStudioProjectBuilderReturn } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal } from "../record/index.ts";
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
//   subflow its entry names among its predecessors has ended (`./dependencies.ts`).
//   One whose predecessor ended `blocked` does not start: its entry cannot be
//   prepared, and it ends `blocked` saying which. Briefs in a ring of waits end
//   `blocked` at once.
// - **Concurrency up to the host's capacity.** Briefs whose waits are over ask
//   the one scheduler of the host port for a lease (`./host-lease.ts`) in the
//   order they became ready, given order first; with capacity 1 they run one at
//   a time in that order.
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
    const leases = automationStudioProjectHostLeaseScope(input.host);
    const ended = request.briefs.map(() => deferred<AutomationStudioProjectBuilderReturn>());
    const turn = async (index: number): Promise<AutomationStudioProjectBuilderReturn> => {
      const brief = request.briefs[index]!;
      if (cyclic.has(index)) return ending.notStarted(brief, "This brief and another of the same dispatch each wait for the other's subflow, so neither can start.");
      const before = await untilEnded(waitsOn[index]!.map((at) => ended[at]!.promise), stop);
      if (before === "stopped") return ending.notStarted(brief, "The build was stopped before this brief's turn came.");
      const blockedBy = waitsOn[index]!.find((_, at) => before[at]!.outcome === "blocked");
      if (blockedBy !== undefined) {
        const predecessor = request.briefs[blockedBy]!;
        return ending.notStarted(brief, `Brief ${predecessor.briefId} for subflow ${predecessor.subflowKey}, which this subflow starts after, ended blocked, so this subflow's entry cannot be prepared.`);
      }
      return await runAutomationStudioProjectDispatchBrief({ dispatcher: input, brief, mapped: mapped[index]!, leases, stop });
    };
    const tasks = request.briefs.map(async (brief, index) => {
      let returned: AutomationStudioProjectBuilderReturn;
      try {
        returned = await turn(index);
      } catch (error) {
        // A record failure: the briefs that wait on this one must not wait forever.
        ended[index]!.resolve(ending.notStarted(brief, "The build record could not be written for this brief."));
        throw error;
      }
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
