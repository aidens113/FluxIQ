import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";

/** Recognize carried Studio context without creating ownership or timestamp fields. */
export function automationStudioHasFlowDocumentEnvelope(graph: ExecutableGraph): graph is AutomationStudioFlowDocument {
  return "schemaVersion" in graph && graph.schemaVersion === "0.1"
    && "ownerKind" in graph && (graph.ownerKind === "task" || graph.ownerKind === "routine" || graph.ownerKind === "policy")
    && "ownerId" in graph && typeof graph.ownerId === "string"
    && "name" in graph && typeof graph.name === "string"
    && "createdAt" in graph && typeof graph.createdAt === "number"
    && "updatedAt" in graph && typeof graph.updatedAt === "number"
    && (!("description" in graph) || typeof graph.description === "string");
}
