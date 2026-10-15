// A no's claim that a left-out row's tested value says what its condition
// looks for, where Core read otherwise (t629).
//
// **Why.** A8 bigbox `run-mv9dcztz-f16d6b5a` step 0080: a no named three rows a
// text condition alone left out, each written with the very text the condition
// looks for beside it, "despite their ... value being" that text. Core's read
// had found another value on each, and settled them: the claim was the judge's
// misreading of the row's value, which Core measured.
//
// **What Core measures, and only that.** For each named left-out row whose
// condition tests the request's own words (`./record.ts`, `quoted`), the value
// its read's witness found. A sentence gives such a row that text as its value
// when it writes the text in brackets of its own ("(4.7, <text>)", never a
// bracket quoting the request) or after a word saying a value ("value being",
// "reads", "shows"). It is refuted on those rows: Core's read found another
// value there, which fails the condition. A sentence naming no such row makes
// no claim here; whether the request asks for the row stays with the other
// claims (`./missing-claim.ts`).

import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows } from "./types.ts";

/** A word saying a value, then the text said as that value. */
const VALUE_WORDS = String.raw`\b(?:values?|text|reads?|reading|shows?|showing|says?|saying)\s+(?:(?:is|are|was|were|being|of|as)\s+)?["“]?`;

/** The claim a sentence makes that a named left-out row's value says its condition's text (header); nothing where it makes none. */
export function automationStudioResultValueClaim(sentence: string, named: AutomationStudioResultNoNamedRows): AutomationStudioResultNoClaim | undefined {
  const findings: string[] = [];
  for (const row of named.leftOut) {
    if (!row.quoted) continue;
    // A value Core read that holds the text itself (an `equals` it fails by more words) is not contradicted by writing the text.
    const read = row.quoted.read.toLowerCase();
    const said = row.quoted.texts.find((text) => !read.includes(text.toLowerCase()) && saidAsValue(sentence, text));
    if (said) findings.push(`Core's read found "${row.quoted.read}" on "${row.label}", not "${said}": ${row.condition} tests that value, and it fails it as written.`);
  }
  return findings.length ? { refuted: true, finding: findings.join(" ") } : undefined;
}

/** Whether a sentence writes `text` as a value: in brackets of its own that quote no request, or after a word saying a value. */
function saidAsValue(sentence: string, text: string): boolean {
  const written = String.raw`(?<![\p{L}\p{N}])${escaped(text)}(?![\p{L}\p{N}])`;
  if (new RegExp(`${VALUE_WORDS}${written}`, "iu").test(sentence)) return true;
  for (const bracket of sentence.matchAll(/\(([^()]*)\)/gu)) {
    const inside = bracket[1]!;
    if (!/\brequest/iu.test(inside) && new RegExp(written, "iu").test(inside)) return true;
  }
  return false;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
