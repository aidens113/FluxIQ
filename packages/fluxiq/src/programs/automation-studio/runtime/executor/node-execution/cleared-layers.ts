import { automationStudioActivityReasonText } from "../../activity/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioClearedLayerKind } from "../contracts.ts";

/** At most this many layers are kept from one dispatch: the client's own bound. */
const LAYERS_MAX = 12;

/** The dismiss words a layer keeps: a short phrase, never a sentence of page text. */
const CONTROL_MAX = 40;

/** A domain's reference to the control it pressed (t470): a short opaque token, never page text. */
const WAY_OUT_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/u;

const KINDS: ReadonlySet<string> = new Set<AutomationStudioClearedLayerKind>(["consent", "rate_limit", "promotion", "assistant", "dialog"]);

/**
 * The layers a dispatch says the client closed over the page while it ran,
 * read defensively from the top of the dispatch payload (`outputs.result`),
 * the same place Core reads a dispatched `route` from (`../../io-policy.ts`).
 * A client reports them as `clearedLayers: [{ kind, control, wayOut? }]`.
 *
 * An entry is kept only when its `kind` is one of Core's closed words and its
 * `control` still reads after the activity bound
 * (`automationStudioActivityReasonText`: whitespace collapsed, token-shaped
 * runs hidden, held to 40 characters). `wayOut` is kept only as a short opaque
 * token (t470); any other shape is dropped and the layer kept without it.
 * Anything else a producer put beside the fields is dropped, as is every entry
 * past the bound. An absent or malformed field reads as no layers.
 */
export function automationStudioClearedLayersOf(payload: unknown): AutomationStudioClearedLayer[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const reported = (payload as { clearedLayers?: unknown }).clearedLayers;
  if (!Array.isArray(reported)) return [];
  const layers: AutomationStudioClearedLayer[] = [];
  for (const entry of reported) {
    if (layers.length >= LAYERS_MAX) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { kind, control, wayOut } = entry as { kind?: unknown; control?: unknown; wayOut?: unknown };
    if (typeof kind !== "string" || !KINDS.has(kind)) continue;
    const words = automationStudioActivityReasonText(control, CONTROL_MAX);
    if (!words) continue;
    layers.push({ kind: kind as AutomationStudioClearedLayerKind, control: words, ...(typeof wayOut === "string" && WAY_OUT_PATTERN.test(wayOut) ? { wayOut } : {}) });
  }
  return layers;
}
