import type { ExecutionSourcePorts } from "./ports.ts";
import type { ExecutionSourceRegistration } from "./registration.ts";

/** Trusted per-scope composition; implementations connect once before live entry. */
export interface ConfiguredExecutionSource {
  readonly owner: object;
  registration(delegatesTo: readonly object[]): ExecutionSourceRegistration;
  connect(ports: ExecutionSourcePorts): void;
}
