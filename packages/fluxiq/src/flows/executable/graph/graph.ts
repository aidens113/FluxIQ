import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "./flow/index.ts";
import type { AutomationStudioFlowEdge } from "./flow/index.ts";

/** The executable graph; persistence and editor ownership travel outside it. */
export type ExecutableGraph = {
  flowId: string;
  nodes: AutomationStudioFlowNode[];
  edges: AutomationStudioFlowEdge[];
  metadata?: JsonObject;
  /** Legacy host scope identity, when carried; standalone executable graphs need none. */
  ownerId?: string;
  /** Supplied host project scope on an existing artifact; standalone executable graphs need none. */
  projectId?: string;
};

/** Compatibility name for the executable portion of a Studio document. */
export type AutomationStudioFlowDocument = ExecutableGraph;
