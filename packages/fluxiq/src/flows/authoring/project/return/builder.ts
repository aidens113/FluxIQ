import type { AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES } from "./outcomes.ts";
import type { AutomationStudioProjectTrialRef } from "./trial-ref.ts";
import type { AUTOMATION_STUDIO_PROJECT_TERMINAL_REASONS as TERMINAL_REASONS } from "./terminal-reasons.ts";

export type AutomationStudioProjectBuilderReturn = {
  briefId: string;
  outcome: (typeof AUTOMATION_STUDIO_PROJECT_RETURN_OUTCOMES)[number];
  reason: string;
  proposal?: { subflowKey: string; revision: number; digest: string };
  trials: AutomationStudioProjectTrialRef[];
  interfaceRequest?: { change: string; why: string };
  /** Survey only. */
  findings?: string[];
  /**
   * The output, by the name the brief's interface gives it, that the brief's latest submission was refused for binding
   * to no value, on a return that is not done (t645): the plan asks the subflow for a value none of its steps makes,
   * and the supervisor is told which subflow takes it (`../supervisor/dispatch-tool.ts`). Absent from returns before it.
   */
  unmadeOutput?: string;
  /**
   * A blocked return's part a subflow before this one already does, by the brief's part id, and the act the run that
   * prepared its entry landed for it where the builder named one (t676): Core checked that claim before the builder's
   * ending was taken (`../../flow-bootstrap/subflow-candidate/done-before.ts`). Absent from every other return.
   */
  doneBefore?: { part: string; act?: string };
  /**
   * Set on a return that is not done when Core's no-progress guard stopped its builder for repeating calls that made
   * no progress (live lane 1 fix 1): read from the loop's own failure code (`../dispatch/ending.ts`), never from the
   * reason's words. One brief of its subflow may then be sent again unchanged, carrying this attempt
   * (`earlierAttempt`, `./subflow-brief.ts`; `../supervisor/dispatch-tool.ts`). Absent from every other return.
   */
  stoppedRepeating?: true;
  /**
   * Set on a return that is not done when nothing a changed brief could say would let it go on (t743), from a closed
   * list read structurally where the return is made (`../dispatch/ending.ts`), never from the reason's words:
   * `allowance_spent`, the brief's allowance refused its next call; `stopped`, the build was stopped; `person_ended`,
   * the brief's permission or person-needed ending stopped it (a lasting act the person did not permit, or a check only
   * a person can pass); `gate_unsatisfiable`, the trial gate's start can never be met (wired from the reset ledger).
   * The supervisor's repair-first rule (`../supervisor/completion.ts`) does not hold an ending for such a return.
   * Absent from every other return.
   */
  terminalReason?: (typeof TERMINAL_REASONS)[number];
  spentUsd: number;
  calls: number;
};
