declare const grantBrand: unique symbol;

/** An ordinary admission grant never certifies execution safety. */
export interface ExecutionEntryGrant {
  readonly [grantBrand]: never;
}
