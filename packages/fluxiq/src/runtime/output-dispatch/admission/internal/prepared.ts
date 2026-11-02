declare const preparedOutputBrand: unique symbol;

export interface PreparedOutputInvocation {
  readonly [preparedOutputBrand]: never;
}
