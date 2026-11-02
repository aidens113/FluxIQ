import type { ExecutionScope } from "./scope/index.ts";
import type { ExecutionEntryBridge } from "./entry/index.ts";
import type { ExecutionAdmissionConsumer } from "./consumer.ts";
import type { ExecutionSourceRegistration, ExecutionSourcePorts } from "./source/index.ts";

/** One configured continuation/scope. Registration closes at the first reservation. */
export interface ExecutionAdmissionAssembly {
  readonly consumer: ExecutionAdmissionConsumer;
  readonly entryBridge: ExecutionEntryBridge;
  openScope(proof: object): Promise<ExecutionScope>;
  registerSource(source: ExecutionSourceRegistration): ExecutionSourcePorts;
}
