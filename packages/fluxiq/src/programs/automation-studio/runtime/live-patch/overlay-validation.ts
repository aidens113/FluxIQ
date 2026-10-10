// Whether an overlaid graph is one the Flow validator would accept, judged
// against the graph it was overlaid on.
//
// The runtime runs a Flow document, the validator reads a Flow artifact, so
// the document's nodes and edges are read into a blank artifact. What refuses
// an overlay is an error the overlay introduced: one the graph did not already
// have. A run's graph that already carries an error was accepted for the run by
// whoever started it; refusing every repair to it on that account would make a
// unit repair answer for a unit it never touched.

import { createBlankAutomationStudioFlowArtifact, validateAutomationStudioFlow, type AutomationStudioFlowDocument } from "../../model/index.ts";

/** What the validator is told about the graph that it cannot read off the graph: its Subflow's role, and the checkpoints other graphs declare. */
export type AutomationStudioOverlayValidationContext = NonNullable<Parameters<typeof validateAutomationStudioFlow>[1]>;

/** The first error the overlay introduced, or nothing when it introduced none. */
export function automationStudioOverlayValidationRefusal(
  before: AutomationStudioFlowDocument,
  after: AutomationStudioFlowDocument,
  context: AutomationStudioOverlayValidationContext = {}
): { code: string; message: string } | undefined {
  const already = new Map<string, number>();
  for (const issue of errors(before, context)) already.set(issue.key, (already.get(issue.key) ?? 0) + 1);
  for (const issue of errors(after, context)) {
    const left = already.get(issue.key) ?? 0;
    if (left === 0) return { code: issue.code, message: issue.message };
    already.set(issue.key, left - 1);
  }
  return undefined;
}

function errors(graph: AutomationStudioFlowDocument, context: AutomationStudioOverlayValidationContext): Array<{ key: string; code: string; message: string }> {
  const artifact = {
    ...createBlankAutomationStudioFlowArtifact({ flowId: graph.flowId, projectId: "runtime-overlay", name: graph.name || graph.flowId, now: 0 }),
    nodes: graph.nodes,
    edges: graph.edges
  };
  return validateAutomationStudioFlow(artifact, context).issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({ key: `${issue.code}\u0000${issue.message}`, code: issue.code, message: issue.message }));
}
