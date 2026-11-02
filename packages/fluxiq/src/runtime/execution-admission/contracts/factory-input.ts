import type { ExecutionScopeOwner } from "./scope/index.ts";
import type { ExecutionAdmissionPersistence } from "./persistence.ts";

export interface ExecutionAdmissionFactoryInput {
  readonly persistence: ExecutionAdmissionPersistence;
  readonly scopes: ExecutionScopeOwner;
}
