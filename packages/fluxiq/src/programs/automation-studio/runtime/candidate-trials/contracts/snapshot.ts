import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialMode } from "./mode.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../../../../runtime/environment/index.ts";

/** Private informational projection; only original checkout membership grants use. */
export interface CandidateTrialCheckoutSnapshot {
  readonly gate: object;
  readonly candidateId: string;
  readonly receipt: Readonly<Pick<AutomationStudioFlowCandidate, "revision" | "digest" | "baseDependencyDigest">>;
  readonly requestKey: string;
  readonly environment: object | undefined;
  readonly environmentKind: AutomationStudioRunEnvironmentKind;
  readonly mode: CandidateTrialMode;
  readonly port: object;
  readonly retained?: object | undefined;
}
