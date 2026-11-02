declare const gateReentryPermit: unique symbol;

export interface GateReentryPermit {
  readonly [gateReentryPermit]: never;
}
