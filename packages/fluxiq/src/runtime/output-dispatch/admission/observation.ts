declare const outputObservationBrand: unique symbol;

export interface OutputExecutionObservation {
  readonly [outputObservationBrand]: never;
}
