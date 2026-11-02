declare const observationBrand: unique symbol;

export interface ExecutionCallbackObservation {
  readonly [observationBrand]: never;
}
