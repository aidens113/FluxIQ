import type { AutomationStudioFlowIntervention } from "../../../model/index.ts";

/** Actual completed check receipts, retained even when a later check never finishes. */
export class AutomationStudioCompletedVerificationChecks {
  private records: AutomationStudioFlowIntervention[] = [];
  private closed = false;

  record = (intervention: AutomationStudioFlowIntervention): void => {
    if (!this.closed) this.records.push(intervention);
  };

  finish(): AutomationStudioFlowIntervention[] {
    this.closed = true;
    return [...this.records];
  }
}
