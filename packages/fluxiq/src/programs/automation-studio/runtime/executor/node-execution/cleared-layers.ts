import { automationStudioActivityReasonText } from "../../activity/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioClearedLayerKind } from "./cleared-layer.ts";

/** At most this many layers are kept from one dispatch: the client's own bound. */
const LAYERS_MAX = 12;

/** The dismiss words a layer keeps: a short phrase, never a sentence of page text. */
const CONTROL_MAX = 40;

/** A layer's or a pressed control's own name (t516): a heading or a button's line, the client's own bound. */
const NAME_MAX = 120;

/** A domain's reference to the control it pressed (t470): a short opaque token, never page text. */
const WAY_OUT_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/u;

/** The node definition the domain says presses a way out (t516): an identifier, never a sentence. */
const DEFINITION_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;

const KINDS: ReadonlySet<string> = new Set<AutomationStudioClearedLayerKind>(["consent", "rate_limit", "promotion", "assistant", "dialog"]);

/**
 * The layers a dispatch says the client closed over the page while it ran,
 * read defensively from the top of the dispatch payload (`outputs.result`),
 * the same place Core reads a dispatched `route` from (`../../io-policy.ts`).
 * A client reports them as
 * `clearedLayers: [{ kind, control, name?, controlName?, wayOut? }]`.
 *
 * An entry is kept only when its `kind` is one of Core's closed words and its
 * `control` still reads after the activity bound
 * (`automationStudioActivityReasonText`: whitespace collapsed, token-shaped
 * runs hidden, held to 40 characters). `name` and `controlName` (t516) are
 * the layer's and the pressed control's own names, kept under the same bound
 * held to 120 characters, and dropped when nothing reads. `wayOut` is kept
 * only as a short opaque token (t470), and `wayOutDefinitionId` (t516) only
 * as an identifier beside it; any other shape is dropped and the layer kept
 * without it.
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
    const { kind, control, name, controlName, wayOut, wayOutDefinitionId } = entry as { kind?: unknown; control?: unknown; name?: unknown; controlName?: unknown; wayOut?: unknown; wayOutDefinitionId?: unknown };
    if (typeof kind !== "string" || !KINDS.has(kind)) continue;
    const words = automationStudioActivityReasonText(control, CONTROL_MAX);
    if (!words) continue;
    const layerName = automationStudioActivityReasonText(name, NAME_MAX);
    const pressedName = automationStudioActivityReasonText(controlName, NAME_MAX);
    layers.push({
      kind: kind as AutomationStudioClearedLayerKind,
      control: words,
      ...(layerName ? { name: layerName } : {}),
      ...(pressedName ? { controlName: pressedName } : {}),
      ...pressedBy(wayOut, wayOutDefinitionId)
    });
  }
  return layers;
}

/** The way out and the definition that presses it, each kept only in its shape; the definition only beside a way out. */
function pressedBy(wayOut: unknown, definitionId: unknown): Pick<AutomationStudioClearedLayer, "wayOut" | "wayOutDefinitionId"> {
  if (typeof wayOut !== "string" || !WAY_OUT_PATTERN.test(wayOut)) return {};
  return typeof definitionId === "string" && DEFINITION_PATTERN.test(definitionId) ? { wayOut, wayOutDefinitionId: definitionId } : { wayOut };
}
