import type { AutomationStudioFlowArtifact } from "../../model/index.ts";
import type { ApplyGraphPatchRequest } from "./graph.ts";

export type FlowProjectRequest = {
  projectId: string;
};

export type FlowMetadataPageRequest = FlowProjectRequest & {
  status?: string;
  limit?: unknown;
  cursor?: unknown;
};

export type CreateFlowRequest = FlowProjectRequest & {
  name?: unknown;
  description?: unknown;
  flowId?: unknown;
};

export type SaveFlowRequest = FlowProjectRequest & {
  /** @deprecated Normal visual editor writes must use ApplyGraphPatchRequest. */
  flow: AutomationStudioFlowArtifact;
  expectedUpdatedAt?: number;
};

export type FlowIdProjectRequest = FlowProjectRequest & {
  flowId: string;
};

export type PublishFlowRequest = FlowIdProjectRequest & {
  version: string;
  /** @deprecated The service computes the authoritative digest from canonical IR. */
  flowDigest?: string;
  publishedBy?: string;
  changelog?: string;
};

export type DeprecateFlowPublicationRequest = FlowIdProjectRequest & { version: string; reason?: string };

export type FlowExpansionSummaryRequest = FlowIdProjectRequest & {
  subflowId?: string;
  status?: string;
  risk?: string;
  role?: string;
  scopeKind?: string;
  requirement?: string;
  search?: string;
  sort?: "updated" | "started" | "duration" | "actions" | "name" | "title" | "status" | "role" | "scope" | "priority" | "risk" | "trigger";
  direction?: "asc" | "desc";
  limit?: unknown;
  offset?: unknown;
};
