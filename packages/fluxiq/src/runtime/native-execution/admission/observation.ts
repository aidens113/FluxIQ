declare const nativeObservationBrand: unique symbol;

export interface NativeExecutionObservation {
  readonly [nativeObservationBrand]: never;
}
