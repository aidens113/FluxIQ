import { automationStudioActivityReasonText } from "../../activity/index.ts";
import { automationStudioLayerKindOf } from "./layer-kind.ts";
import type { AutomationStudioObstruction, AutomationStudioObstructionIntent, AutomationStudioObstructionWayOut } from "./obstruction.ts";
import { automationStudioOpaqueRefOf } from "./opaque-ref.ts";

/** A layer's identity and the target it covered (CC7): short opaque tokens, never page text. */
const TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/u;

/** The node definition that presses a way out: an identifier, never a sentence. */
const DEFINITION_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;

/** A layer's own name, the bound a closed layer's name keeps (`./cleared-layers.ts`). */
const NAME_MAX = 120;

/** The most ways out kept from one obstruction: the client's own bound. */
const WAY_OUTS_MAX = 6;

/** The longest wait a page may state for a slow-down, in milliseconds (ten minutes). */
const RETRY_AFTER_MAX_MS = 600_000;

const INTENTS: ReadonlySet<string> = new Set<AutomationStudioObstructionIntent>(["dismiss", "accept", "neutral"]);

/**
 * The layer a dispatch says stood over the page when its target was covered
 * or it failed (CC7, `./obstruction.ts`), read defensively from the top of
 * the dispatch payload (`outputs.result.obstruction`), beside `clearedLayers`.
 *
 * The whole obstruction is dropped when it is not an object, when its `kind`
 * reads as none of Core's generic words (the old words mapped,
 * `./layer-kind.ts`), or when `dismiss` is not a list. Otherwise each field is
 * kept only in its own shape and dropped alone: `id` and `covers` as short
 * opaque tokens, `name` under the activity bound held to 120 characters,
 * `retryAfterMs` as a whole number from 1 ms to ten minutes and only on a
 * `rate_limit`. Each way out is kept when its `intent` is one of the three
 * words, with `definitionId` only as an identifier, `controlRef` only as an
 * inert JSON object of at most 8 KB (`./opaque-ref.ts`), and `action` only as
 * `back`; at most six are kept, in the client's order. Anything else a
 * producer put beside the fields is dropped.
 */
export function automationStudioObstructionOf(payload: unknown): AutomationStudioObstruction | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const reported = (payload as { obstruction?: unknown }).obstruction;
  if (!reported || typeof reported !== "object" || Array.isArray(reported)) return undefined;
  const { id, name, kind, covers, retryAfterMs, dismiss } = reported as { id?: unknown; name?: unknown; kind?: unknown; covers?: unknown; retryAfterMs?: unknown; dismiss?: unknown };
  const generic = automationStudioLayerKindOf(kind);
  if (!generic || !Array.isArray(dismiss)) return undefined;
  const layerName = automationStudioActivityReasonText(name, NAME_MAX);
  const waitMs = generic === "rate_limit" && typeof retryAfterMs === "number" && Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 1 && retryAfterMs <= RETRY_AFTER_MAX_MS ? retryAfterMs : undefined;
  return {
    ...(typeof id === "string" && TOKEN_PATTERN.test(id) ? { id } : {}),
    ...(layerName ? { name: layerName } : {}),
    kind: generic,
    ...(typeof covers === "string" && TOKEN_PATTERN.test(covers) ? { covers } : {}),
    ...(waitMs === undefined ? {} : { retryAfterMs: waitMs }),
    dismiss: dismiss.flatMap((entry) => wayOutOf(entry) ?? []).slice(0, WAY_OUTS_MAX)
  };
}

/** One way out in its shape, or nothing when its intent is not one of the three words. */
function wayOutOf(entry: unknown): AutomationStudioObstructionWayOut | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const { intent, controlRef, definitionId, action } = entry as { intent?: unknown; controlRef?: unknown; definitionId?: unknown; action?: unknown };
  if (typeof intent !== "string" || !INTENTS.has(intent)) return undefined;
  const target = automationStudioOpaqueRefOf(controlRef);
  return {
    intent: intent as AutomationStudioObstructionIntent,
    ...(target ? { controlRef: target } : {}),
    ...(typeof definitionId === "string" && DEFINITION_PATTERN.test(definitionId) ? { definitionId } : {}),
    ...(action === "back" ? { action: "back" as const } : {})
  };
}
