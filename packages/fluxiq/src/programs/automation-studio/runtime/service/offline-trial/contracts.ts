// Types of the offline trials (traces and offline trials, P4; a subflow's,
// t769 P6): what each is asked to run, on which recorded trace and in which
// build phase, and what it answers -- the trial runner's own outcome (a whole
// candidate's, or a subflow proposal's partial one) beside the trial evidence
// result (U5) that says what that outcome rests on.

import type {
  ClientGatewayClientHello,
  ClientGatewayService,
  ClientGatewayTraceMatcherReport,
  ClientGatewayTraceMatcherSessionView,
  ClientGatewayTraceReevaluator,
  ClientGatewayTraceStore
} from "../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialEvidenceReasonCode, AutomationStudioTrialEvidenceResult } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowTrialRequest } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioCandidateTrialOutcome, AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord } from "../candidate-trial/index.ts";
import type { AutomationStudioSubflowTrialOutcome, AutomationStudioSubflowTrialPorts } from "../subflow-trial/index.ts";

/**
 * The build phase asking for the trial. Offline trials stay out of
 * exploration (Decision 2): `exploration` is refused with
 * `offline_not_allowed_in_phase`; `test` and `repair` may run one.
 */
export type AutomationStudioOfflineTrialPhase = "exploration" | "test" | "repair";

/** The gateway the trial's matcher session is attached to, fed through and detached from: the trial's own live gateway. */
export type AutomationStudioOfflineTrialGateway = Pick<ClientGatewayService, "attachScopedSession" | "receiveRaw" | "receiveTraceArtifact" | "disconnect">;

/** The recorded trace an offline trial runs on: a live trial's `test` trace, by its store and id. */
export type AutomationStudioOfflineTrialSource = {
  store: ClientGatewayTraceStore;
  traceId: string;
  /** The trace's reference to the session the matcher stands in for; default: the one session its operations went to. */
  sessionRef?: string | undefined;
};

/**
 * What every offline trial is given besides what its runner runs: the
 * recorded trace, the gateway its matcher session is attached to, the build
 * phase, and how the trace is read (`./matcher-session.ts`).
 */
export type AutomationStudioOfflineTrialSessionInput = {
  source: AutomationStudioOfflineTrialSource;
  gateway: AutomationStudioOfflineTrialGateway;
  phase: AutomationStudioOfflineTrialPhase;
  /** The contract versions this reader speaks; default: the versions the host's trace episodes record (`./reader-contracts.ts`). */
  contractVersions?: Readonly<Record<string, string>> | undefined;
  /**
   * The public view of the session the trace stands for, used only when the
   * trace recorded none (no `session.claimed`): in a build, the live session's
   * public view for the same client. It never replaces a recorded view. With
   * neither, the trial is refused before anything runs (`incomplete_capture`).
   */
  sessionView?: ClientGatewayClientHello | undefined;
  /**
   * Handed to the trace matcher (P5): asked to answer a changed command that
   * keeps the recorded action type, from what the trace recorded up to that
   * operation. Without it, every changed command is an evidence gap.
   */
  reevaluator?: ClientGatewayTraceReevaluator | undefined;
};

export type AutomationStudioOfflineCandidateTrialInput = AutomationStudioOfflineTrialSessionInput & {
  /** The candidate trial request, exactly as a live trial gets it. */
  request: AutomationStudioCandidateTrialRequest;
  /** The trial ports, exactly as a live trial gets them; the trial runs with their `environment` replaced by the trace environment. */
  ports: AutomationStudioCandidateTrialPorts;
  /** The goal contract the result is bound to; default: the candidate's original instructions digest, as the trial runner binds it. */
  goalContractVersion?: string | undefined;
};

export type AutomationStudioOfflineSubflowTrialInput = AutomationStudioOfflineTrialSessionInput & {
  /** The partial trial request, exactly as a live partial trial gets it. */
  request: AutomationStudioSubflowTrialRequest;
  /** The partial trial ports, exactly as a live partial trial gets them; the trial runs with their `environment` replaced by the trace environment. */
  ports: AutomationStudioSubflowTrialPorts;
  /** The goal contract the result is bound to; default: the brief's structure plan digest, whose parts and success check the scoped judge asks about. */
  goalContractVersion?: string | undefined;
  /** The largest judge prompt an earlier partial trial of this build sent, sizing the judge calls the trial holds before it runs, as a live partial trial is handed it. */
  judgeInputTokens?: number | undefined;
};

/**
 * What the trial evidence result reads of a trial runner's outcome, which a
 * whole candidate's and a subflow proposal's partial trial both answer: how
 * the run ended, the revision and digest tried, and the judge's verdict.
 */
export type AutomationStudioOfflineTrialRunOutcome = {
  record: { execution: AutomationStudioCandidateTrialRecord["execution"]; revision: number; digest: string };
  result: { verdict: AutomationStudioCandidateTrialVerdict };
};

/** An operation a reevaluator answered in the recorded one's place: its ordinal, action type and the fields that differed, by path; never a value. */
export type AutomationStudioOfflineTrialReevaluatedOperation = {
  ordinal: number;
  actionType: string;
  fields: string[];
};

/** Something the offline trial took from outside its trace, declared with every result it produced: what, and why it cannot carry what the candidate did. */
export type AutomationStudioOfflineTrialNormalization = {
  field: string;
  reason: string;
};

/** Why an offline trial was not run: nothing ran, nothing was judged, and no evidence result exists. */
export type AutomationStudioOfflineTrialRefusal = {
  status: "refused";
  reasonCode: AutomationStudioTrialEvidenceReasonCode;
  detail: string;
};

export type AutomationStudioOfflineCandidateTrialRefusal = AutomationStudioOfflineTrialRefusal;

/**
 * An offline trial that ran: the trial runner's own outcome (what the trial
 * gate reads), the trial evidence result validated against U5 (what
 * that outcome rests on: recorded evidence and pure computation, never live),
 * the matcher's report it was read from, which session view the matcher's
 * session was attached with (a supplied one is also a declared
 * normalization), how many of the recorded operations the run matched, and
 * which of those a reevaluator answered (each also makes `snapshot_evaluation`
 * one of the result's origins).
 */
export type AutomationStudioOfflineTrialRan<Trial extends AutomationStudioOfflineTrialRunOutcome> = {
  status: "ran";
  trial: Trial;
  evidence: AutomationStudioTrialEvidenceResult;
  matcher: ClientGatewayTraceMatcherReport;
  sessionView: ClientGatewayTraceMatcherSessionView["source"];
  normalizations: AutomationStudioOfflineTrialNormalization[];
  supported: { matchedOperations: number; recordedOperations: number };
  reevaluated: AutomationStudioOfflineTrialReevaluatedOperation[];
};

export type AutomationStudioOfflineCandidateTrialRan = AutomationStudioOfflineTrialRan<AutomationStudioCandidateTrialOutcome>;

export type AutomationStudioOfflineCandidateTrialOutcome = AutomationStudioOfflineTrialRefusal | AutomationStudioOfflineCandidateTrialRan;

/** An offline subflow trial that ran: the partial trial's own outcome beside its evidence result, as a whole candidate's offline trial answers. */
export type AutomationStudioOfflineSubflowTrialRan = AutomationStudioOfflineTrialRan<AutomationStudioSubflowTrialOutcome>;

export type AutomationStudioOfflineSubflowTrialOutcome = AutomationStudioOfflineTrialRefusal | AutomationStudioOfflineSubflowTrialRan;
