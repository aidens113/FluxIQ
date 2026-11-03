// A sentence of a no, less Core's own wording of the conditions it names
// (t624), so the words of a condition are never read as the judge's claim.
//
// **Why.** Core names a condition `condition N (wording)`, its wording as the
// Flow wrote it (`../read-account/condition-name.ts`), and the judge is asked to
// name it the same way. That wording holds the very words a claim is read by:
// `sponsored is absent` reads as rows called missing (`./missing-claim.ts`),
// `name not contains "Holder"` as something called wrong (`./weigh.ts`,
// `NEGATIVE`), and its quoted text as a row Core cannot find
// (`./named-rows.ts`). A8 bigbox `run-mv96rz68-532f5e52` step 0029's no said
// "Keep ... condition 4 (name not contains Holder)": a reason that keeps a
// condition the read applies says nothing about the rows, so it must neither
// stand as a reason nor be refuted as a claim and asked again.
//
// **What is taken out.** The brackets after `condition N` whose text reads as
// a condition -- it holds a relation Core's grammar names (contains,
// startsWith, endsWith, matches, equals, atLeast, atMost, lessThan,
// greaterThan, is present, is absent) -- brackets inside it included. The words
// `condition N` stay, so the sentence still names that condition. Brackets
// holding anything else are the judge's own words and stay.

/** Core's naming of a condition's number, just before its bracketed wording. */
const NAMED = /\bcondition\s+\d+\s*\(/giu;
/** A relation Core's condition grammar names. */
const RELATION = /\b(?:contains|startsWith|endsWith|matches|equals|atLeast|atMost|lessThan|greaterThan|is\s+(?:present|absent))\b/u;

/** The sentence with each bracketed condition wording after `condition N` taken out (header). */
export function automationStudioResultWithoutConditionWording(sentence: string): string {
  let said = "";
  let from = 0;
  for (const match of sentence.matchAll(NAMED)) {
    if (match.index < from) continue;
    const open = match.index + match[0].length - 1;
    const close = closing(sentence, open);
    if (close === undefined || !RELATION.test(sentence.slice(open + 1, close))) continue;
    said += sentence.slice(from, open).trimEnd();
    from = close + 1;
  }
  return said + sentence.slice(from);
}

/** Where the bracket opened at `open` closes, brackets inside it counted; none where it never does. */
function closing(text: string, open: number): number | undefined {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === "(") depth += 1;
    if (text[at] !== ")") continue;
    depth -= 1;
    if (depth === 0) return at;
  }
  return undefined;
}
