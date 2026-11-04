// What a call asks, with the words it was asked in taken out.
//
// **The failure this closes.** The exact-repeat guard keys a call on its whole
// input, so a real model that rewords `reason` or `summary` gets past it
// (`docs/working/studio-controller-plan/reports/followups/retry-refusals.md`).
//
// **Which keys.** The narrative members of Core's own tool contracts, read from
// every call in the saved step logs: a dispatch's and a plan's `reason`, a
// submission's `summary`, a plan's `purpose`, `purposes` and `notAsked`, and the
// plain synonyms a tool might carry. Nothing under `parameters` is ever taken
// out: that is what a node acts with, where `note` or `text` is what gets typed
// into the page. No value is read, so words decide nothing.

import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../../evidence-loop-decision.ts";

const NARRATIVE_KEYS: ReadonlySet<string> = new Set(["reason", "summary", "purpose", "purposes", "notAsked", "why", "rationale", "explanation", "comment", "note", "notes", "thought", "thoughts"]);

/** The member whose contents a node acts with: never free text to this rule. */
const ACTS_WITH = "parameters";

function meaningful(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(meaningful);
  if (value === null || typeof value !== "object") return value;
  const kept: JsonObject = {};
  for (const [key, member] of Object.entries(value)) {
    if (NARRATIVE_KEYS.has(key)) continue;
    kept[key] = key === ACTS_WITH ? member as JsonValue : meaningful(member as JsonValue);
  }
  return kept;
}

/** Everywhere a value is written by reference to a row or an earlier step (`../../../flow-authoring/draft/binding-forms.ts`), or the row a pass of a repeat is on. */
const ROW_BINDINGS: ReadonlySet<string> = new Set(["$row", "$step", "item"]);

/** Whether the task's own row binding says which row this call is about. */
export function automationStudioLlmLoopRowBound(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(automationStudioLlmLoopRowBound);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, member]) => ROW_BINDINGS.has(key) || automationStudioLlmLoopRowBound(member as JsonValue));
}

function withoutHandles(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutHandles);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "handle").map(([key, member]) => [key, withoutHandles(member as JsonValue)]));
}

/** The key of a call as it really ran: a handle names a control only while its page stands, so a fingerprint beside it is what says which control it was. */
export function automationStudioLlmLoopRanKey(toolId: string, ranAs: JsonObject, context?: string): string {
  return automationStudioLlmLoopCallKey(toolId, withoutHandles(ranAs) as JsonObject, context);
}

/** The input with its free text taken out. */
export function automationStudioLlmLoopMeaningfulInput(input: JsonObject): JsonObject {
  return meaningful(input) as JsonObject;
}

/** A short digest of a JSON value, in canonical form. */
export function automationStudioLlmLoopDigest(value: JsonValue): string {
  return createHash("sha256").update(automationStudioLlmEvidenceCanonicalJson(value)).digest("hex").slice(0, 24);
}

/** What makes two calls the same call to this rule: the tool, the meaningful input, and what it is answered against besides its page. */
export function automationStudioLlmLoopCallKey(toolId: string, input: JsonObject, context?: string): string {
  return automationStudioLlmLoopDigest([toolId, context ?? "", automationStudioLlmLoopMeaningfulInput(input)]);
}
