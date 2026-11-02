import type { GateReentryBinding } from "./binding.ts";

export interface GateReentryConsumer {
  consume(permit: object, expected: GateReentryBinding): boolean;
}
