// The recordings a build's offline-first trials run against (trace plan P6,
// t769, design section 2). The trace store reads only by id, so the build
// remembers, as its live trials finish, the latest eligible one of each scope:
//
// - a whole candidate's scope is `whole:<candidateId>`; a subflow's is
//   `<buildId>/<subflowKey>`, the latest across that subflow's briefs and
//   plans (a predecessor that changed shows up as matcher gaps);
// - eligible: a live trial port's record with a run id and a trace id that
//   ran (`execution` not `not_run`), not a judge asked again about an earlier
//   trial, and for a subflow one whose entry was prepared;
// - never an offline run's own derived trace (`noteDerived`), and never a
//   trial of another scope: identical states in different episodes never
//   merge (T17), one trace per trial, the latest replacing the one before.
//
// The runner checks the rest when it reads the trace: a derived manifest, an
// incomplete capture or a trace with no session view is refused, and the test
// runs live.

import type { AutomationStudioCandidateTrialRecord } from "../candidate-trial/index.ts";
import type { AutomationStudioSubflowTrialRecord } from "../subflow-trial/index.ts";
import type { AutomationStudioOfflineFirstSource } from "./contracts.ts";

export class AutomationStudioOfflineFirstSources {
  /** A whole candidate's scope. */
  static wholeScope(candidateId: string): string {
    return `whole:${candidateId}`;
  }

  /** A subflow's scope in one build. */
  static subflowScope(buildId: string, subflowKey: string): string {
    return `${buildId}/${subflowKey}`;
  }

  private readonly latestByScope = new Map<string, AutomationStudioOfflineFirstSource>();
  /** The run ids already observed: a record seen again never replaces a later one. */
  private readonly seen = new Set<string>();
  /** Offline runs' own traces: never a recording to run against. */
  private readonly derived = new Set<string>();

  /** Takes a whole candidate trial's record as its scope's source when it is eligible; answers whether it did. */
  observeWhole(record: AutomationStudioCandidateTrialRecord): boolean {
    return this.keep(AutomationStudioOfflineFirstSources.wholeScope(record.candidateId), record, record.judgedAgain !== true);
  }

  /** Takes a partial trial's record as its subflow's source when it is eligible; answers whether it did. */
  observeSubflow(record: AutomationStudioSubflowTrialRecord): boolean {
    return this.keep(AutomationStudioOfflineFirstSources.subflowScope(record.identity.buildId, record.identity.subflowKey), record, record.entryPrepared === true);
  }

  /** Marks an offline run's own trace, which no record may make a source. */
  noteDerived(traceId: string | undefined): void {
    if (traceId !== undefined) this.derived.add(traceId);
  }

  /** The scope's latest eligible live trial, or nothing before its first. */
  latest(scope: string): AutomationStudioOfflineFirstSource | undefined {
    const source = this.latestByScope.get(scope);
    return source ? { ...source } : undefined;
  }

  private keep(scope: string, record: { trialRunId?: string; traceId?: string; execution: string }, eligible: boolean): boolean {
    const { trialRunId, traceId } = record;
    if (trialRunId === undefined || traceId === undefined || this.seen.has(trialRunId)) return false;
    this.seen.add(trialRunId);
    if (!eligible || record.execution === "not_run" || this.derived.has(traceId)) return false;
    this.latestByScope.set(scope, { traceId, trialRunId });
    return true;
  }
}
