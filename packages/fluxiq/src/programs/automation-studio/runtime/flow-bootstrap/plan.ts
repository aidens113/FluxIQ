// Flow Bootstrap plan: the limits, contracts, provider schemas, catalog context,
// structural parsing and registry validation that a bootstrap completion passes
// through. Every member is implemented under ./plan/ and re-exported here, so
// consumers of this module and of the flow-bootstrap barrel see what they
// always saw.
//
// automationStudioFlowBootstrapCatalogByteBudget is the one member declared
// here rather than under ./plan/. It is the only part of the plan that reads
// the LLM runtime's token estimator, which runtime/llm/index.ts deliberately
// keeps internal; holding that import at this level leaves every module under
// ./plan/ reaching outside its own directory only through a barrel.
import { automationStudioLlmTokenBudgetBytes } from "../llm/token-estimation.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA
} from "./plan/index.ts";

export * from "./plan/index.ts";

export function automationStudioFlowBootstrapCatalogByteBudget(input: {
  maxInputTokens: number;
  instructionBytes: number;
}): number {
  const totalBytes = automationStudioLlmTokenBudgetBytes(input.maxInputTokens);
  const schemaBytes = Buffer.byteLength(JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA), "utf8");
  const fixedEnvelopeReserveBytes = 1_800;
  return Math.max(0, Math.min(
    AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes,
    totalBytes - Math.max(0, Math.trunc(input.instructionBytes)) - schemaBytes - fixedEnvelopeReserveBytes
  ));
}
