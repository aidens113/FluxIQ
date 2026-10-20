// Types of the offline candidate trial (traces and offline trials, P4): what
// it is asked to run, on which recorded trace and in which build phase, and
// what it answers -- the candidate trial's own outcome beside the trial
// evidence result (U5) that says what that outcome rests on.

import type { ClientGatewayClientHello, ClientGatewayService, ClientGatewayTraceMatcherReport, ClientGatewayTraceMatcherSessionView, ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioTrialEvidenceReasonCode, AutomationStudioTrialEvidenceResult } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialRequest } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateTrialOutcome, AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";

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

export type AutomationStudioOfflineCandidateTrialInput = {
  /** The candidate trial request, exactly as a live trial gets it. */
  request: AutomationStudioCandidateTrialRequest;
  /** The trial ports, exactly as a live trial gets them; the trial runs with their `environment` replaced by the trace environment. */
  ports: AutomationStudioCandidateTrialPorts;
  source: AutomationStudioOfflineTrialSource;
  gateway: AutomationStudioOfflineTrialGateway;
  phase: AutomationStudioOfflineTrialPhase;
  /** The contract versions this reader speaks; default: the versions the host's trace episodes record (`./reader-contracts.ts`). */
  contractVersions?: Readonly<Record<string, string>> | undefined;
  /** The goal contract the result is bound to; default: the candidate's original instructions digest, as the trial runner binds it. */
  goalContractVersion?: string | undefined;
  /**
   * The public view of the session the trace stands for, used only when the
   * trace recorded none (no `session.claimed`): in a build, the live session's
   * public view for the same client. It never replaces a recorded view. With
   * neither, the trial is refused before anything runs (`incomplete_capture`).
   */
  sessionView?: ClientGatewayClientHello | undefined;
};

/** Something the offline trial took from outside its trace, declared with every result it produced: what, and why it cannot carry what the candidate did. */
export type AutomationStudioOfflineTrialNormalization = {
  field: string;
  reason: string;
};

/** Why an offline trial was not run: nothing ran, nothing was judged, and no evidence result exists. */
export type AutomationStudioOfflineCandidateTrialRefusal = {
  status: "refused";
  reasonCode: AutomationStudioTrialEvidenceReasonCode;
  detail: string;
};

/**
 * An offline trial that ran: the candidate trial runner's own outcome (what
 * the trial gate reads), the trial evidence result validated against U5 (what
 * that outcome rests on: recorded evidence and pure computation, never live),
 * the matcher's report it was read from, which session view the matcher's
 * session was attached with (a supplied one is also a declared
 * normalization), and how many of the recorded operations the run matched.
 */
export type AutomationStudioOfflineCandidateTrialRan = {
  status: "ran";
  trial: AutomationStudioCandidateTrialOutcome;
  evidence: AutomationStudioTrialEvidenceResult;
  matcher: ClientGatewayTraceMatcherReport;
  sessionView: ClientGatewayTraceMatcherSessionView["source"];
  normalizations: AutomationStudioOfflineTrialNormalization[];
  supported: { matchedOperations: number; recordedOperations: number };
};

export type AutomationStudioOfflineCandidateTrialOutcome = AutomationStudioOfflineCandidateTrialRefusal | AutomationStudioOfflineCandidateTrialRan;
