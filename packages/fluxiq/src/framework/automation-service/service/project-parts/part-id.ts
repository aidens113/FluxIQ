import { createHash } from "node:crypto";
import type { AutomationStudioAppliedFlowPart } from "./types.ts";

/**
 * The key a part keeps across builds: the one the plan gave the Subflow, which a
 * rebuild of the same Flow gives again under new ids. A Subflow with none is keyed
 * by its own id.
 */
export function projectPartKeyOf(entry: AutomationStudioAppliedFlowPart): string {
  const key = entry.subflow.metadata?.bootstrapSymbolicKey ?? entry.graphFlow.metadata?.bootstrapSymbolicKey;
  return typeof key === "string" && key ? key : entry.subflow.subflowId;
}

/** A part's id, stable from its Flow and its key, and a valid id whatever either holds. */
export function projectPartIdOf(flowId: string, key: string): string {
  return `part.${createHash("sha256").update(`${flowId}\n${key}`).digest("hex").slice(0, 24)}`;
}
