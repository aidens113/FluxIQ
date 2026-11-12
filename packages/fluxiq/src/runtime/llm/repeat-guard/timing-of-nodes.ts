// Which parameters each node declares as timing, read from the nodes' own
// definitions (`AutomationNodeParameter.timing`), for the repeat keys
// (`./timing-free.ts`). Core names no parameter: a node whose definition is
// unknown, or that declares none, keeps every parameter in its key.

import type { AutomationStudioLlmEvidenceTimingOf } from "./timing-free.ts";

/** A node's definition as far as its timing is concerned. */
type NodeWithParameters = { parameters: ReadonlyArray<{ id: string; timing?: true | undefined }> };

/** The timing parameters of a node by its id, from `definitionOf`; nothing when there is no `definitionOf`. */
export function automationStudioLlmEvidenceTimingOfNodes(definitionOf: ((nodeId: string) => NodeWithParameters | undefined) | undefined): AutomationStudioLlmEvidenceTimingOf | undefined {
  if (definitionOf === undefined) return undefined;
  return (node) => {
    const names = definitionOf(node)?.parameters.filter((parameter) => parameter.timing === true).map((parameter) => parameter.id);
    return names?.length ? names : undefined;
  };
}
