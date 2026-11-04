// A call step that names a saved part of the project's library at one version
// (`builtin.control.call-subflow`, `part: { partId, version }`).
//
// **One execution path.** A pin travels as a Subflow id of its own form, so the frame,
// the boundary, retries, repair, verification, `calledVersions` and the ledger read it
// exactly as they read a sibling's id, and a trace's `subflowTarget` shows which version
// ran. Nothing but `./call-subflow.ts` and a source of graphs reads what the id holds.

import type { JsonValue } from "../../../core/index.ts";

export type AutomationStudioPartPin = { partId: string; version: number };

/** How deep pinned calls may go, the caller counted: what a run refuses, and what a save refuses before there is a run to refuse. */
export const AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH = 8;

const PINNED_ID = /^part:(.+):v([1-9][0-9]*)$/u;

/** The pin a step's `part` parameter holds, or nothing when it holds none that can be read. */
export function automationStudioPartPinOf(value: JsonValue | undefined): AutomationStudioPartPin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { partId, version } = value;
  if (typeof partId !== "string" || !partId.trim() || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) return undefined;
  return { partId: partId.trim(), version };
}

/** The Subflow id a pinned part's frame runs under (header). */
export function automationStudioPinnedSubflowId(pin: AutomationStudioPartPin): string {
  return `part:${pin.partId}:v${pin.version}`;
}

/** The pin a Subflow id holds, or nothing for any other id. */
export function automationStudioPinOfSubflowId(subflowId: string | null | undefined): AutomationStudioPartPin | undefined {
  const read = subflowId ? PINNED_ID.exec(subflowId) : null;
  if (!read) return undefined;
  const version = Number(read[2]);
  return Number.isSafeInteger(version) ? { partId: read[1]!, version } : undefined;
}
