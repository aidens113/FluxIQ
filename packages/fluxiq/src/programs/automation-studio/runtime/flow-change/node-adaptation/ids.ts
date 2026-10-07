import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY, AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT } from "./contracts.ts";

/** Bounds one id, so a corrupted metadata string is never copied onto every attempt. */
const ADAPTATION_ID_MAX_LENGTH = 256;

/**
 * True for a string that can be an adaptation id: non-empty, at most 256
 * characters, no surrounding whitespace, and no C0 control character or DEL.
 */
export function isAutomationStudioAdaptationId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > ADAPTATION_ID_MAX_LENGTH || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * The adaptation ids a node's metadata lists, in order, without duplicates.
 * Undefined when the list is absent, empty, longer than the limit, or holds any
 * entry that is not an adaptation id: a malformed list is ignored whole rather
 * than partly trusted, because a replay reads it as proof of what ran.
 */
export function automationStudioNodeAdaptationIds(metadata: JsonObject | undefined): string[] | undefined {
  const listed = metadata?.[AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY];
  if (!Array.isArray(listed) || listed.length === 0 || listed.length > AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT) return undefined;
  const adaptationIds: string[] = [];
  for (const candidate of listed) {
    if (!isAutomationStudioAdaptationId(candidate)) return undefined;
    if (!adaptationIds.includes(candidate)) adaptationIds.push(candidate);
  }
  return adaptationIds;
}

