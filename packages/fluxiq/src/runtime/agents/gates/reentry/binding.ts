export interface GateReentryBinding {
  readonly scope: object;
  readonly gate: object;
  readonly requestKey: string;
  readonly generation: string;
  readonly completedOrdinal: number;
  readonly remaining: number;
}
