declare const scopeBrand: unique symbol;

/** Authority is original configured-instance membership, not this type brand. */
export interface ExecutionScope {
  readonly [scopeBrand]: never;
}
