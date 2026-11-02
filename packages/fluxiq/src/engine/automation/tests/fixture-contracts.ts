import type { ExecutableGraph, ExecutableFlow } from "../../../flows/executable/graph/index.ts";

export type AutomationStudioFlowDocument = ExecutableGraph & { schemaVersion: "0.1"; ownerKind: "task" | "routine" | "policy"; ownerId: string; name: string; description?: string; createdAt: number; updatedAt: number };

export type AutomationStudioFlowArtifact = ExecutableFlow & { schemaVersion: "0.1"; projectId: string; visibility: "private" | "public"; origin: "manual" | "recorded" | "imported" | "migrated"; source: { mode: "visual" } | { mode: "code"; moduleId: string }; publication: { status: "draft" }; createdAt: number; updatedAt: number };
