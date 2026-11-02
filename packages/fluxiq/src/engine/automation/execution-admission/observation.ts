declare const automationObservationBrand: unique symbol;

/** Original private per-scope binding; never an implementation/model context field. */
export interface AutomationExecutionObservation {
  readonly [automationObservationBrand]: never;
}
