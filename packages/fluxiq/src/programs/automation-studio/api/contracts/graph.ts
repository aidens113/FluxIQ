import type { JsonObject } from "../../../../core/index.ts";
import type { FlowIdProjectRequest } from "./flow.ts";

export type GraphViewportRequest = FlowIdProjectRequest & {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  cursor?: string | null;
  limit?: number;
  pinnedNodeIds?: string[];
};

export type GraphPatchOperation =
  | { op: "add_node"; node: Record<string, unknown> }
  | { op: "move_node"; nodeId: string; x: number; y: number }
  | { op: "set_node_parameters"; nodeId: string; values: JsonObject }
  | { op: "delete_node"; nodeId: string }
  | { op: "add_edge"; edge: Record<string, unknown> }
  | { op: "delete_edge"; edgeId: string };

export type ApplyGraphPatchRequest = FlowIdProjectRequest & {
  baseRevision: number;
  mutationId: string;
  operations: GraphPatchOperation[];
  message?: string;
};

export type ListGraphRevisionsRequest = FlowIdProjectRequest & { cursor?: string | null; limit?: number };

export type CreateGraphSnapshotRequest = FlowIdProjectRequest & { revisionNumber?: number; mutationId?: string };

export type RestoreGraphSnapshotRequest = FlowIdProjectRequest & { snapshotSha256: string; mutationId: string };
