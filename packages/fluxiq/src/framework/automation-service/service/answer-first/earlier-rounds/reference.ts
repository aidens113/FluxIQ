// One earlier call as a single short line (t1036, D10): its number, its id, what ran, on what, and how it came back. Never
// what the call found: a result is not carried whole into a fresh round, only named, so the round can ask for the call
// again by its id.
//
// What it acted on is the words the domain gave (`on`); a call with none says what it was asked, shortly, so a reference
// still tells one call of a kind from another.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

/** Longer than a target's words or a query, shorter than a call's whole input. */
const ASKED_CHARACTERS = 80;

/** `#n id on words`, numbered `n` as it ran; the id is the call's own where the trail holds one. */
export function automationStudioAnswerFirstEarlierReference(step: AutomationStudioResultTrailStep, n: number): string {
  const subject = step.on?.trim() || askedWords(step.asked);
  return [`#${n}`, step.callId, subject].filter((part) => part !== undefined && part !== "").join(" ");
}

function askedWords(asked: JsonValue | undefined): string {
  if (asked === undefined) return "";
  const words = typeof asked === "string" ? asked : JSON.stringify(asked);
  return words.length > ASKED_CHARACTERS ? `${words.slice(0, ASKED_CHARACTERS)}...` : words;
}
