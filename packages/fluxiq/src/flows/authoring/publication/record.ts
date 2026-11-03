import type { AutomationStudioPublishedFlowSnapshot } from "./index.ts";

export type AutomationStudioFlowPublicationRecord = {
  schemaVersion: "0.1";
  publicationId: string;
  projectId: string;
  flowId: string;
  version: string;
  status: "published" | "deprecated";
  snapshot: AutomationStudioPublishedFlowSnapshot;
  createdAt: number;
  deprecatedAt?: number;
  deprecationReason?: string;
};
