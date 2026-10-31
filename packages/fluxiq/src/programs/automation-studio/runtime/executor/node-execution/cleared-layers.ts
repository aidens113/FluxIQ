import { automationStudioActivityReasonText } from "../../activity/index.ts";
import type { AutomationStudioClearedLayer } from "./cleared-layer.ts";
import { automationStudioLayerKindOf } from "./layer-kind.ts";
import { automationStudioOpaqueRefOf } from "./opaque-ref.ts";

/** At most this many layers are kept from one dispatch: the client's own bound. */
const LAYERS_MAX = 12;

/** The dismiss words a layer keeps: a short phrase, never a sentence of page text. */
const CONTROL_MAX = 40;

/** A layer's or a pressed control's own name (t516): a heading or a button's line, the client's own bound. */
const NAME_MAX = 120;

/** A domain's reference to the control it pressed (t470), and a layer's own identity (CC7): a short opaque token, never page text. */
const TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/u;

/** The node definition the domain says presses a way out (t516): an identifier, never a sentence. */
const DEFINITION_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;

/**
 * The layers a dispatch says the client closed over the page while it ran,
 * read defensively from the top of the dispatch payload (`outputs.result`),
 * the same place Core reads a dispatched `route` from (`../../io-policy.ts`).
 * A client reports them as
 * `clearedLayers: [{ kind, control, id?, name?, controlName?, wayOut?, wayOutDefinitionId?, controlRef? }]`.
 *
 * An entry is kept only when its `kind` reads as one of Core's generic words
 * (the old words mapped, `./layer-kind.ts`) and its `control` still reads
 * after the activity bound (`automationStudioActivityReasonText`: whitespace
 * collapsed, token-shaped runs hidden, held to 40 characters). `name` and
 * `controlName` (t516) are the layer's and the pressed control's own names,
 * kept under the same bound held to 120 characters, and dropped when nothing
 * reads. `id` (CC7) is kept only as a short opaque token. `wayOut` is kept
 * only as a short opaque token (t470), `wayOutDefinitionId` (t516) only as an
 * identifier beside it or beside a `controlRef`, and `controlRef` (CC7) only as an inert JSON object of
 * at most 8 KB (`./opaque-ref.ts`) beside the definition; any other shape is
 * dropped and the layer kept without it.
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
    const { kind, control, id, name, controlName, wayOut, wayOutDefinitionId, controlRef } = entry as { kind?: unknown; control?: unknown; id?: unknown; name?: unknown; controlName?: unknown; wayOut?: unknown; wayOutDefinitionId?: unknown; controlRef?: unknown };
    const generic = automationStudioLayerKindOf(kind);
    if (!generic) continue;
    const words = automationStudioActivityReasonText(control, CONTROL_MAX);
    if (!words) continue;
    const layerName = automationStudioActivityReasonText(name, NAME_MAX);
    const pressedName = automationStudioActivityReasonText(controlName, NAME_MAX);
    layers.push({
      kind: generic,
      control: words,
      ...(typeof id === "string" && TOKEN_PATTERN.test(id) ? { id } : {}),
      ...(layerName ? { name: layerName } : {}),
      ...(pressedName ? { controlName: pressedName } : {}),
      ...pressedBy(wayOut, wayOutDefinitionId, controlRef)
    });
  }
  return layers;
}

/**
 * The way out, the definition that presses it and its durable target, each kept only in its shape. The definition
 * stands beside something it can press: the `wayOut` token, or a `controlRef` (CC7, t799), which a client may send
 * without a token; the target stands only beside the definition.
 */
function pressedBy(wayOut: unknown, definitionId: unknown, controlRef: unknown): Pick<AutomationStudioClearedLayer, "wayOut" | "wayOutDefinitionId" | "controlRef"> {
  const token = typeof wayOut === "string" && TOKEN_PATTERN.test(wayOut) ? { wayOut } : {};
  const definition = typeof definitionId === "string" && DEFINITION_PATTERN.test(definitionId) ? definitionId : undefined;
  const target = definition === undefined ? undefined : automationStudioOpaqueRefOf(controlRef);
  if (target) return { ...token, wayOutDefinitionId: definition!, controlRef: target };
  return "wayOut" in token && definition !== undefined ? { ...token, wayOutDefinitionId: definition } : token;
}
