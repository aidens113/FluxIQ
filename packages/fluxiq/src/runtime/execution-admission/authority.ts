import type { ExecutionAdmissionAssembly, ExecutionAdmissionFactoryInput } from "./contracts/index.ts";
import { ExecutionAdmissionLifecycle } from "./lifecycle.ts";

/** Each configured continuation/scope uses a fresh factory against the same durable owner. */
export function createExecutionAdmissionAuthority(input: ExecutionAdmissionFactoryInput): ExecutionAdmissionAssembly {
  return new ExecutionAdmissionLifecycle(input).assembly;
}
