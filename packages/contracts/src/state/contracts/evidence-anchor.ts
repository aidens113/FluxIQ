import type { JsonObject } from "../../core.js";
import type { StateBounds } from "./bounds.js";
import type { StateBoundsKind } from "./bounds-kind.js";

export type EvidenceAnchor =
  | { type: "none"; metadata?: JsonObject }
  | { type: "point"; x: number; y: number; rendererId?: string; metadata?: JsonObject }
  | { type: "bounds"; bounds: StateBounds; boundsKind?: StateBoundsKind; rendererId?: string; metadata?: JsonObject }
  | { type: "element"; elementId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "entity"; entityId: string; entityKind?: string; rendererId?: string; metadata?: JsonObject }
  | { type: "region"; regionId: string; rendererId?: string; metadata?: JsonObject }
  | { type: "path"; points: Array<{ x: number; y: number }>; rendererId?: string; metadata?: JsonObject };
