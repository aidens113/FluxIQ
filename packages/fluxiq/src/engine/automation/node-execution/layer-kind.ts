// Core's generic words for a layer over the page (P6, CC7, t799), read from a
// client's own word for it. One reading for every place a client's kind is
// taken in: the closed layers (`./cleared-layers.ts`), the obstruction
// (`./obstruction-of.ts`), and the trial feedback's own pass over the raw
// payload (`../../service/candidate-trial/interruptions.ts`).

import type { AutomationStudioClearedLayerKind } from "./cleared-layer.ts";

/** Core's generic kinds (`./cleared-layer.ts`), and the old words a client may still send, each read as its generic kind. */
const KINDS: Readonly<Record<string, AutomationStudioClearedLayerKind>> = Object.freeze({
  overlay: "overlay", notice: "notice", rate_limit: "rate_limit", assistant: "assistant", other: "other",
  consent: "overlay", promotion: "notice", dialog: "other"
});

/** The generic kind a client's word names, or nothing for any other value (a robot check is never one). */
export function automationStudioLayerKindOf(kind: unknown): AutomationStudioClearedLayerKind | undefined {
  return typeof kind === "string" && Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined;
}
