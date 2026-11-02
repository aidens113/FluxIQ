import type { ExecutableFlowValidationContext } from "./context.ts";

/** Enclosing outputs are explicit; a graph never manufactures an empty Flow interface. */
export type ExecutableGraphValidationContext = ExecutableFlowValidationContext & {
  requiredSubflowOutputIds: readonly string[];
};
