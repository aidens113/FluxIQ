import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { automationStudioHasFlowDocumentEnvelope } from "./flow-document.ts";

/** A Studio callback may use a full envelope only when the executing frame actually carried it. */
export function automationStudioLegacyGraphRequest<TRequest extends { graph: ExecutableGraph }>(request: TRequest): (TRequest & { graph: AutomationStudioFlowDocument }) | undefined {
  if (!automationStudioHasFlowDocumentEnvelope(request.graph)) return undefined;
  return { ...request, graph: request.graph };
}
