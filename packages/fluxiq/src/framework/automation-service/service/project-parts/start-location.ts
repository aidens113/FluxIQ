import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";

/** Where a Flow's build began: the first step of its graphs that opens a written address, which a build's arrival is. */
export function firstLiteralAddress(graphs: readonly AutomationStudioFlowArtifact[]): string | undefined {
  for (const graph of graphs) {
    for (const node of graph.nodes) {
      const address = node.parameterValues?.url;
      if (typeof address === "string" && /^https?:/u.test(address)) return address;
    }
  }
  return undefined;
}
