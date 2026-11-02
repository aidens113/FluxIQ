import type { JsonObject } from "../../core/index.ts";

/** Structural evidence consumed by matching; producers retain their own state schema. */
export type TargetBounds = { x: number; y: number; width: number; height: number };
export type TargetEvidenceAnchor = { type: string; entityId?: string; entityKind?: string; elementId?: string };
export type TargetVisualLayer = {
  id: string; kind: string; content?: string; label?: string; statePath?: string;
  anchor?: TargetEvidenceAnchor; bounds?: TargetBounds; isVisibleOnViewport?: boolean; metadata?: JsonObject;
};
export type TargetStateValue = {
  value: unknown; sensitive?: boolean; semanticRole?: string; metadata?: JsonObject;
  presentation?: { label?: string; anchor?: TargetEvidenceAnchor };
};
export type TargetMatchingSnapshot = {
  id?: string;
  namespaces: Record<string, { values: Record<string, TargetStateValue> }>;
  presentation?: { visualFrames?: Array<{ id: string; layers: TargetVisualLayer[] }> };
};
