import type { EvidenceAnchor, StatePath } from "../../state/contracts/index.js";
import type { ActionVisualTargetSource } from "./visual-target-source.js";
import type { JsonObject } from "../../core.js";

export type ActionVisualEntityTarget = {
  entityId: string;
  entityKind?: string;
  statePath?: StatePath;
  anchor?: EvidenceAnchor;
  visualFrameId?: string;
  visualLayerId?: string;
  stateSnapshotId?: string;
  confidence?: number;
  source?: ActionVisualTargetSource;
  metadata?: JsonObject;
};
