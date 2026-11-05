// The long part of what the draft entry says, sent once in the head.
//
// The draft is rewritten on nearly every call: it lists every step, so its text
// changed on 40 of the 51 decisions of `run-mw37vz9n-a77a02c2`, and it stays where
// it was, whole, after the cached part of the request. Sending it only when it
// changes costs more, not less: each copy stays in every later request (2.75x the
// input tokens, an estimated $0.36 more on that run), and one copy moved about saves
// $0.04. What does not change is its guidance, about 4K of its characters. That
// goes in front of the window, where it is read from cache, and the entry keeps
// only what is said conditionally. The model reads the same words and the whole
// list of steps on every decision.
//
// The loop's own entry is untouched: only what goes on the wire changes.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_GUIDES, AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-authoring/draft/index.ts";

type Entry = { callId: string; toolId: string; value: JsonValue };

/** The guide's words on the head, and the window with them taken off its draft entry. No draft entry, or one saying something else, stays as it is. */
export function automationStudioLlmLiftDraftGuide(evidence: readonly Entry[]): { guide?: string; evidence: readonly Entry[] } {
  const draft = evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
  const value = draft?.value;
  if (!draft || !isRecord(value) || typeof value.instruction !== "string") return { evidence };
  const said = value.instruction;
  const guide = AUTOMATION_STUDIO_FLOW_DRAFT_GUIDES.find((words) => said.startsWith(words));
  if (guide === undefined) return { evidence };
  const { instruction: _instruction, ...rest } = value;
  const left = said.slice(guide.length).trim();
  const lifted: Entry = { ...draft, value: { ...rest, ...(left ? { instruction: left } : {}) } };
  return { guide: `How to read the core.flow_draft entry, which is "here" below. ${guide}`, evidence: evidence.map((entry) => entry === draft ? lifted : entry) };
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
