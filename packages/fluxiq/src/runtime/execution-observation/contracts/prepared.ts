declare const invocationBrand: unique symbol;

/** Original framework invocation, never passed into the callback's arguments. */
export interface PreparedExecutionCallback {
  readonly [invocationBrand]: never;
}
