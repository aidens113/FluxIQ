// The name of one task (t870, design D10): the same words on the same site. A saved Flow runs
// only for this key, so another site's origin is another task. Whitespace, case and the
// punctuation a sentence ends with are not (t869): "Save the tables" and "save the tables." are one
// task, and as two keys the second started with an empty act record and did again what the first
// had done. The words are folded for the key only; everywhere else they stay as the person typed
// them. Words that say the task another way are still another task. A location that is missing or
// does not parse leaves the origin out rather than failing: a task must not stop for a key.
//
// **A caller may name the task itself** (`callerKey`, a FluxNode's name and spec hash; fluxnode-plan
// N1). Then the words and the site are no part of it, so other words for the same task find what
// it kept. It is hashed in a space of its own, so no caller's key can equal one made from words.

import { createHash } from "node:crypto";

/** What a sentence ends with, and nothing that can stand inside one: a closing quote or bracket stays. */
const SENTENCE_END = /[\s.!?,;:…。！？]+$/u;

export function automationStudioAnswerFirstTaskKey(input: { instructionText: string; startLocation?: string | undefined; callerKey?: string | undefined }): string {
  if (typeof input.callerKey === "string" && input.callerKey.length > 0) return keyOf(["caller", input.callerKey, ""]);
  const text = (typeof input.instructionText === "string" ? input.instructionText : "").normalize("NFC").replace(/\s+/g, " ").trim().replace(SENTENCE_END, "").toLowerCase();
  return keyOf([text, originOf(input.startLocation)]);
}

/** Words and site make a pair and a caller's key a triple, so the two spaces never meet. */
function keyOf(parts: readonly string[]): string {
  return `task.${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40)}`;
}

function originOf(location: string | undefined): string {
  if (typeof location !== "string" || !URL.canParse(location.trim())) return "";
  const origin = new URL(location.trim()).origin;
  return origin === "null" ? "" : origin.toLowerCase();
}
