import type { AutomationStudioRecordOutput } from "@fluxiq/contracts/records";
import type { ProposalNodeStateLink } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRecordingMapperCandidate } from "./candidate.ts";
import type { RecordingProposalEvidenceReference } from "./evidence-reference.ts";

export type RecordingFlowActionCandidate = {
  candidateId: string;
  actionEntryId: string;
  sourceObservationIds: string[];
  sourceInputIds: string[];
  outputId: string;
  parameters: JsonObject;
  expectedConfirmation?: NonNullable<AutomationStudioRecordingMapperCandidate["expectedConfirmation"]>;
  /** What the host should find true after the action, as the mapper proposed it: a plain object Core owns a clone of and never reads. */
  expectedState?: JsonObject;
  /**
   * The parsed record output, its `recordsPath` resolved. Carried into node
   * definitions, unlike `expectedState`: without it a definition's run would
   * hand the fields the schema excludes to the node's outputs.
   */
  recordOutput?: AutomationStudioRecordOutput;
  /** The recorded action's timeout in milliseconds, written to `parameterValues.timeoutMs`. Carried into node definitions. */
  timeoutMs?: number;
  /**
   * How long the recording waited between the entry the previous candidate was
   * mapped from and this one, on the monotonic clock. Written onto the node as
   * its wait ceiling, which the executor reads
   * (`runtime/executor/recorded-state.ts`): a recorded delay is the longest the
   * run will wait for the node's expected state before attempting it anyway,
   * never a sleep. Absent on the first candidate, which has nothing to wait
   * after.
   */
  recordedGapMs?: number;
  confidence: number;
  evidence: RecordingProposalEvidenceReference[];
  stateLink?: ProposalNodeStateLink;
  /** Action-mapped input events remain observable confirmation, never policy state. */
  policyStateEligible: false;
  label?: string;
  description?: string;
};
