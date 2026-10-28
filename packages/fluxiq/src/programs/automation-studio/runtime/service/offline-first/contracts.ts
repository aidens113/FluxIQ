// Types of offline-first trials in builds (trace plan P6, t769): what the host
// installs for them, what one build's factory is given, and what it answers --
// the `offlineFirst` port member the trial gates ask before any site action
// (`../../flow-bootstrap/offline-first/`), the live records it is fed, and the
// offline runs it kept apart from them.

import type { ClientGatewayClientHello, ClientGatewayTraceReevaluator, ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialEvidenceResult } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioTrialOfflineFirst } from "../../flow-bootstrap/offline-first/index.ts";
import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord } from "../candidate-trial/index.ts";
import type { AutomationStudioOfflineTrialGateway, AutomationStudioOfflineTrialPhase } from "../offline-trial/index.ts";
import type { AutomationStudioSubflowTrialPorts, AutomationStudioSubflowTrialRecord } from "../subflow-trial/index.ts";

/**
 * What the host gives every offline-first trial (`./installation.ts`): the
 * gateway a matcher session attaches to, the trace store of a project, the
 * public view of a project's live session for a trace that recorded none, and
 * a reevaluator for changed reads. Without a reevaluator (tier 1) every
 * changed read is an evidence gap, and its trial runs live.
 */
export type AutomationStudioOfflineTrialHost = {
  gateway: AutomationStudioOfflineTrialGateway;
  storeFor(projectId: string): ClientGatewayTraceStore;
  sessionViewFor(projectId: string): ClientGatewayClientHello | undefined;
  reevaluator?: ClientGatewayTraceReevaluator | undefined;
};

/** The live trial a scope's offline-first test runs against: its trace and its run (the trace's episode). */
export type AutomationStudioOfflineFirstSource = { traceId: string; trialRunId: string };

/**
 * One offline run a factory made: the runner's record of it, the trial
 * evidence result (U5) it rests on, and whether its answer kept the failure or
 * ran the trial live. Never a live record: promotion, trial counts and the
 * live-episode tally read only the live port's records.
 */
export type AutomationStudioOfflineFirstRecord<TRecord> = {
  record: TRecord;
  evidence: AutomationStudioTrialEvidenceResult;
  answered: "kept" | "live";
};

/** What the judge was paid for a factory's offline runs, in the trial record's own terms. */
export type AutomationStudioOfflineFirstSpent = AutomationStudioCandidateTrialRecord["judge"];

/**
 * What one build's offline-first factory is given: the same ports its live
 * trial port is built over, what the host installed (absent: offline trials
 * are off, and every test runs live), and the build phase (`repair` for a
 * repair build, else `test`; `exploration` is refused by the runner), and
 * optionally where to read the live port's records from.
 */
type AutomationStudioOfflineFirstInputs<TPorts, TRecord> = {
  ports: TPorts;
  installation: AutomationStudioOfflineTrialHost | undefined;
  phase: AutomationStudioOfflineTrialPhase;
  /**
   * The live port's `records()`, read at the start of every `offlineFirst`
   * call and each handed to `observe`, so a caller need not wrap the live
   * port to feed it. Absent, only what the caller hands `observe` counts.
   */
  liveRecords?: (() => readonly TRecord[]) | undefined;
};

export type AutomationStudioOfflineFirstWholeInput = AutomationStudioOfflineFirstInputs<AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord> & {
  /** The candidate id the live port is bound to (`automationStudioCandidateTrialPort(candidateId, ports)`). */
  candidateId: string;
};

export type AutomationStudioOfflineFirstSubflowInput = AutomationStudioOfflineFirstInputs<AutomationStudioSubflowTrialPorts, AutomationStudioSubflowTrialRecord> & {
  /** The build id the live partial-trial port is bound to (`automationStudioSubflowTrialPort(buildId, ports)`). */
  buildId: string;
};

/**
 * One build's offline-first trials of one kind:
 *
 * - `offlineFirst`: the port member a gate asks once per revision;
 * - `observe(record)`: hands it a record of the live port, so the scope's
 *   latest eligible live trial is its recording; a record seen before is
 *   ignored, so handing it every `records()` entry after each live call is
 *   safe; answers whether the record became its scope's source;
 * - `offlineRecords()`: the offline runs, apart from the live records;
 * - `spent()`: what the judge was paid for them.
 */
type AutomationStudioOfflineFirstFactory<TRequest, TResult extends AutomationStudioCandidateTrialResult | AutomationStudioSubflowTrialResult, TRecord> = {
  offlineFirst: AutomationStudioTrialOfflineFirst<TRequest, TResult>;
  observe(record: TRecord): boolean;
  offlineRecords(): AutomationStudioOfflineFirstRecord<TRecord>[];
  spent(): AutomationStudioOfflineFirstSpent;
};

export type AutomationStudioOfflineFirstWhole = AutomationStudioOfflineFirstFactory<AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult, AutomationStudioCandidateTrialRecord>;

export type AutomationStudioOfflineFirstSubflow = AutomationStudioOfflineFirstFactory<AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult, AutomationStudioSubflowTrialRecord>;
