import type { StateFactReference } from "../../../runtime/state/facts/index.ts";
import type { NodeEvidenceRole } from "./index.ts";
import type { EvidenceComparator } from "./index.ts";
import type { EvidenceAnchor } from "@fluxiq/contracts/state";
import type { EvidenceReference } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../core/index.ts";

export type NodeEvidenceBinding = {
  id: string;
  nodeId: string;
  fact: StateFactReference;
  role: NodeEvidenceRole;
  comparator: EvidenceComparator;
  expectedValue?: unknown;
  weight?: number;
  confidence?: number;
  anchor?: EvidenceAnchor;
  provenance?: EvidenceReference[];
  metadata?: JsonObject;
};
