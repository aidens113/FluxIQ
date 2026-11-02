import type { ExecutionScopeBinding } from "./binding.ts";

export interface StoredExecutionScope {
  readonly scopeId: string;
  readonly binding: ExecutionScopeBinding;
}
