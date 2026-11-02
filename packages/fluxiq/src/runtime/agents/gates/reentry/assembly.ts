import type { GateReentryIssuer } from "./issuer.ts";
import type { GateReentryConsumer } from "./consumer.ts";

export interface GateReentryAssembly {
  readonly issuer: GateReentryIssuer;
  readonly consumer: GateReentryConsumer;
}
