// The part of a value a text test held on, said so a judge can see it (t511).
//
// **Why.** Live run `run-mv6qr7fk-77f30b49` kept "Trust & Safety Engineer" on
// `title matches "Rust"`: a bare pattern ignores case, so it held on the "rust"
// inside "Trust". The judges were shown the kept row and the condition, not
// where they met, and that row came back in four revisions. So a kept row
// (or, for a `not` test, a left-out row) says which part of its text the test
// found, and the whole word around it when the part sits inside a longer word.
//
// The test is Core's own (`automationStudioRecordConditionPattern` for a
// pattern, the same case- and layout-blind comparison for the rest), run on the
// value as stored; nothing is read from the request or a model.

import { automationStudioRecordConditionPattern, type AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";

/** The text tests, in the order a condition's parts are said. */
const TEXT_TESTS = ["matches", "contains", "startsWith", "endsWith"] as const;
/** The most of a value a pattern is run against, as Core's condition does. */
const MATCHED_CHARACTERS = 2_000;
/** A character that continues a word. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * What a text test of `condition` found in `value`, said -- `"rust" inside the
 * word "Trust" (matches "Rust")` -- or `undefined` when the condition has no text
 * test or none of its entries holds on the value.
 */
export function automationStudioResultTextMatch(condition: AutomationStudioRecordCondition, value: string): string | undefined {
  const text = value.replace(/\s+/gu, " ").trim();
  for (const key of TEXT_TESTS) {
    const written = condition[key];
    if (written === undefined) continue;
    for (const entry of Array.isArray(written) ? written : [written]) {
      const span = key === "matches" ? patternSpan(entry, text) : literalSpan(key, entry, text);
      if (span) return `${said(text, span)} (${key} ${JSON.stringify(entry)})`;
    }
  }
  return undefined;
}

type Span = { start: number; end: number };

function patternSpan(written: string, text: string): Span | undefined {
  const pattern = automationStudioRecordConditionPattern(written);
  const found = pattern?.exec(text.slice(0, MATCHED_CHARACTERS));
  return found ? { start: found.index, end: found.index + found[0].length } : undefined;
}

/** Where a literal test holds, read case-blind; a value whose case folding changes its length is not placed. */
function literalSpan(key: "contains" | "startsWith" | "endsWith", written: string, text: string): Span | undefined {
  const lower = text.toLowerCase();
  const needle = written.replace(/\s+/gu, " ").trim().toLowerCase();
  if (lower.length !== text.length || !needle) return undefined;
  const start = key === "contains" ? lower.indexOf(needle)
    : key === "startsWith" ? (lower.startsWith(needle) ? 0 : -1)
    : (lower.endsWith(needle) ? lower.length - needle.length : -1);
  return start < 0 ? undefined : { start, end: start + needle.length };
}

/** The matched part, and the word it sits inside when it starts or ends within one. */
function said(text: string, span: Span): string {
  const part = text.slice(span.start, span.end);
  if (!part) return "an empty part of the text";
  const inside = (span.start > 0 && word(text[span.start - 1]) && word(text[span.start]))
    || (span.end < text.length && word(text[span.end]) && word(text[span.end - 1]));
  if (!inside) return JSON.stringify(part);
  let start = span.start;
  let end = span.end;
  while (start > 0 && word(text[start - 1])) start -= 1;
  while (end < text.length && word(text[end])) end += 1;
  return `${JSON.stringify(part)} inside the word ${JSON.stringify(text.slice(start, end))}`;
}

function word(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTER.test(character);
}
