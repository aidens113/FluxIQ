import type { ExecutableGraph } from "../../../flows/executable/graph/index.ts";

/** Reads only scope actually supplied by the graph; no project identity is invented. */
export function automationStudioGraphHostProjectId(flow: Pick<ExecutableGraph, "metadata" | "projectId" | "ownerId">): string | undefined {
  for (const identity of [flow.metadata?.projectId, flow.projectId, flow.ownerId]) {
    if (typeof identity === "string" && identity) return identity;
  }
  return undefined;
}
