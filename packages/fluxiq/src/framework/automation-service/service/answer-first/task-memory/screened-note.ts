// A note's words, screened as a result's words are (a credential-shaped text is dropped whole, a
// locator-shaped one rewritten) and cut to 600 characters each. A note with nothing left is none.
// Screening twice gives the same words, so a store may screen on every write.

import { automationStudioFlowLessScreenedWords } from "../../../../../runtime/result-verification/index.ts";

const MAX_CHARS = 600;
const FIELDS = ["worked", "failed", "quirks"] as const;

export function automationStudioAnswerFirstScreenedNote(note: { worked?: unknown; failed?: unknown; quirks?: unknown } | undefined): { worked?: string; failed?: string; quirks?: string } | undefined {
  if (typeof note !== "object" || note === null) return undefined;
  const out: { worked?: string; failed?: string; quirks?: string } = {};
  for (const field of FIELDS) {
    const raw = note[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const text = automationStudioFlowLessScreenedWords(raw.trim().slice(0, 4000)).text?.trim().slice(0, MAX_CHARS).trim();
    if (text) out[field] = text;
  }
  return Object.keys(out).length ? out : undefined;
}
