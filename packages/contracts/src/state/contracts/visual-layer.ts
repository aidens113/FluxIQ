import type { StateBounds } from "./bounds.js";
import type { StateBoundsKind } from "./bounds-kind.js";
import type { JsonObject } from "../../core.js";
import type { EvidenceAnchor } from "./evidence-anchor.js";
import type { StateRenderKind } from "./render-kind.js";

export type StateVisualLayer =
  | {
      id: string;
      kind: "image";
      contentRef: string;
      bounds: StateBounds;
      opacity?: number;
      boundsKind?: StateBoundsKind;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "text";
      content: string;
      bounds?: StateBounds;
      anchor?: EvidenceAnchor;
      style?: { tone?: string; size?: "xs" | "sm" | "md" | "lg" };
      boundsKind?: StateBoundsKind;
      renderKind?: StateRenderKind;
      isVisibleOnViewport?: boolean;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "region";
      bounds: StateBounds;
      label?: string;
      statePath?: string;
      anchor?: EvidenceAnchor;
      boundsKind?: StateBoundsKind;
      renderKind?: StateRenderKind;
      isVisibleOnViewport?: boolean;
      metadata?: JsonObject;
    }
  | {
      id: string;
      kind: "element";
      label?: string;
      bounds?: StateBounds;
      statePath?: string;
      anchor?: EvidenceAnchor;
      boundsKind?: StateBoundsKind;
      renderKind?: StateRenderKind;
      isVisibleOnViewport?: boolean;
      metadata?: JsonObject;
    };
