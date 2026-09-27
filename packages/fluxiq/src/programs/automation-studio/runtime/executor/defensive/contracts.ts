import type { AutomationStudioAdaptiveFailureClass, AutomationStudioFailureStage } from "@fluxiq/contracts/automation-studio";

/**
 * What the default runtime does about one fault.
 *
 * `retry` is the answer the product wants wherever it is honest: a fault the
 * runtime can absorb is absorbed rather than ending a run. `refuse` is reserved
 * for a fault where attempting the same thing again cannot change the outcome,
 * or where attempting it again could act on the world twice.
 */
export type AutomationStudioFaultDisposition = "retry" | "refuse";

/**
 * Whether the action behind this fault could already have taken effect.
 *
 * `unacted` means the request demonstrably never reached whatever would carry it
 * out -- nothing accepted it, nothing answered it, or the answer says plainly it
 * was not processed. `ambiguous` means it may have been carried out and the
 * answer was lost, which is the case a mutating node must not repeat blindly.
 */
export type AutomationStudioFaultEffect = "unacted" | "ambiguous";

/** Where the classification came from, so a trace never has to be guessed at. */
export type AutomationStudioFaultSource =
  /** The producer's own structured failure record. */
  | "failure_record"
  /** An exception the node threw, read for its name, code, status and text. */
  | "thrown_error"
  /** A failed result that carried no record, classified from its message. */
  | "result_message";

/**
 * One fault, classified: what it was, whether the runtime absorbs it, and why.
 *
 * `reason` exists because this repository has been bitten repeatedly by a reason
 * that was computed and thrown away. Every assessment is recorded on the run's
 * defence ledger whether it was absorbed or refused, so a debug can see what the
 * run survived and what it declined to survive.
 */
export type AutomationStudioFaultAssessment = {
  disposition: AutomationStudioFaultDisposition;
  category: AutomationStudioAdaptiveFailureClass;
  /** Stable machine code for grouping faults without reading prose. */
  code: string;
  source: AutomationStudioFaultSource;
  effect: AutomationStudioFaultEffect;
  reason: string;
  /** A wait the source itself asked for, in milliseconds, already bounded. */
  hintedWaitMs?: number;
  /** The transport status the fault carried, when it carried one. */
  httpStatus?: number;
  stage?: AutomationStudioFailureStage;
};

/**
 * How consequential a node is, which decides whether an ambiguous fault may be
 * attempted again and whether a Flow may walk past the node's failure.
 *
 * `none` and `internal` change nothing outside the run. `external` and
 * `destructive` act on the world, so a second attempt is a second act unless the
 * node says it is safe to repeat.
 */
export type AutomationStudioNodeSideEffectClass = "none" | "internal" | "external" | "destructive";
