// Barrel for a FluxNode run's outputs (fluxnode-plan N3): shaped from Core's rows, acts and the
// run's inputs with their lineage, the type inferred where none was declared, and the stored rows.
export { fluxNodeInferredType } from "./inferred-type.ts";
export { fluxNodeShapedOutputs, type FluxNodeOutputSources, type FluxNodeShapedOutputs } from "./shaped-outputs.ts";
export { fluxNodeStoredRows, type FluxNodeStoredRows } from "./stored-rows.ts";
