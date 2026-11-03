/** A diagnostic answer about one attempt; conditions and host values are never retained. */
export interface AutomationExpectationFact {
  readonly attemptId: string;
  readonly source: string;
  readonly declaredCount: number;
  readonly checkedCount: number;
  readonly outcome: "passed" | "failed" | "unknown";
}
