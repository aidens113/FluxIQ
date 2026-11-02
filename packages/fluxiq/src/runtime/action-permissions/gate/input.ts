import type { AutomationStudioActionPermissionStage, AutomationStudioInstructedConsequence } from "../../../flows/executable/permissions/index.ts";

export type AutomationStudioActionPermissionGateInput = {
  /** What the person allowed this run. Absent permits nothing. */
  permittedConsequences?: readonly string[] | undefined;
  stage: AutomationStudioActionPermissionStage;
  /** The instructions the run is carrying out, which is why it wanted anything at all. */
  instructionIds?: readonly string[] | undefined;
  /**
   * What the person's instruction already asks for, when it is known: the set
   * stored with a Flow, read through `currentAutomationStudioInstructedConsequences`.
   */
  instructed?: readonly AutomationStudioInstructedConsequence[] | undefined;
  /**
   * How to find out, when it is not known yet: called at most once, on the
   * first action that declares a lasting consequence. A rejection, or an
   * answer with nothing grounded in it, adds nothing, so the run asks.
   */
  deriveInstructed?: (() => Promise<readonly AutomationStudioInstructedConsequence[]>) | undefined;
  /**
   * Whether raising a request ends the run: `signal` fires and the caller
   * stops. Absent means yes, which is the behaviour every caller had before a
   * question could reach anybody. A caller that passes `false` is saying it
   * will put the request to a person and `settle` it, and is responsible for
   * what happens if nobody answers.
   */
  endsOnRequest?: boolean | undefined;
  now?: (() => number) | undefined;
  newRequestId?: (() => string) | undefined;
};
