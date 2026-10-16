// A result verification's verdict, read from a reply the provider cut off
// after it (t653).
//
// Live run `run-mva6mlo8-f519063c`: four of 21 judge calls stopped with
// `finish_reason: length` at the provider's 8,192-token ceiling, each inside a
// `summary` that repeated one sentence hundreds of times. No request sends a
// reply cap (t254), and a loop ends at no size, so no limit is the fix. The
// verification's schema now asks for `kind` and `diagnosis` before `summary`
// (`./output-schema.ts`); this reads what such a reply committed to before the
// cut.
//
// What is read is only what closed before the cut: the reply must open with
// `{`, lead with `kind`, and its `diagnosis` object must have closed, with
// `answersRequest` one of Core's three words. Every top-level member that
// closed is parsed as JSON, exactly as written; the member the cut fell inside
// is dropped, never completed. The reply is marked `truncatedAfterVerdict: true`,
// the typed field the verification reads to hold a yes to the fields that
// arrived whole (`result-verification/verify.ts`, round 2). The model's summary
// is not carried even when it closed: Core's own plain sentence stands in its
// place, for a reader of the call, and nothing decides on it. Whatever is
// returned is validated as any reply is, by the envelope and by the harness.

import { isRecord } from "./json-record.ts";

/** What a reader of the call is told in place of the cut summary. Words for a person only: the verdict rule reads `truncatedAfterVerdict`. */
const CUT_SUMMARY = "The reply was cut off at the provider's output limit after its diagnosis closed; what followed it did not arrive whole and is not read.";

const VERDICTS: readonly unknown[] = ["yes", "no", "unknown"];

/** The diagnosis a cut-off verification reply closed before the cut, as a reply Core can validate, or `undefined` when it closed none. */
export function automationStudioDeepSeekVerdictBeforeCut(content: string): Record<string, unknown> | undefined {
  for (const candidate of closedPrefixes(content.trim())) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(parsed) || Object.keys(parsed)[0] !== "kind" || parsed.kind !== "diagnosis") return undefined;
    const diagnosis = parsed.diagnosis;
    if (!isRecord(diagnosis) || !VERDICTS.includes(diagnosis.answersRequest)) return undefined;
    return {
      kind: "diagnosis",
      summary: CUT_SUMMARY,
      ...(parsed.confidence !== undefined ? { confidence: parsed.confidence } : {}),
      diagnosis,
      truncatedAfterVerdict: true
    };
  }
  return undefined;
}

/**
 * The object's members that closed before the cut, as texts to parse, the most
 * complete first: the whole object where its root closed; the content closed
 * where the cut fell just after a member's value ended in a closing bracket or
 * quote; and the content up to the last comma between the root's members,
 * closed. A number, `true`, `false` or `null` the cut may have shortened is
 * never taken from the end of the content.
 */
function closedPrefixes(text: string): string[] {
  if (!text.startsWith("{")) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastComma = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return [text.slice(0, index + 1)];
      if (depth < 0) return [];
    } else if (char === "," && depth === 1) lastComma = index;
  }
  const prefixes: string[] = [];
  if (!inString && depth === 1 && /["}\]]$/u.test(text)) prefixes.push(`${text}}`);
  if (lastComma > 0) prefixes.push(`${text.slice(0, lastComma)}}`);
  return prefixes;
}
