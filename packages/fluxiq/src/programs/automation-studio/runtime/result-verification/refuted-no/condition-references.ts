// The conditions a sentence of a no names by number (t631), as Core names
// them and a judge is told to: `condition 4`, and the lists a judge writes of
// several -- `conditions 4, 5 and 6`, `conditions 4-6`, `conditions (4, 5, 6)`,
// `conditions 5/6` -- each wording in brackets after a number taken out first,
// as `./condition-wording.ts` takes it out after `condition N`. Numbers only:
// which condition of which read each names is `./advice-condition.ts`'s to
// resolve against Core's record.
//
// A singular `condition` names one number, so "3 rows by condition 4, 2 by
// condition 5" names 4 and 5, never 2.

/** A relation Core's condition grammar names: a bracket holding one is a condition's wording. */
const RELATION = /\b(?:contains|startsWith|endsWith|matches|equals|atLeast|atMost|lessThan|greaterThan|is\s+(?:present|absent))\b/u;
/** One condition by number. */
const ONE = /\bcondition\s+(\d+)\b/giu;
/** Several, listed or as a range. */
const SEVERAL = /\bconditions\s*\(?\s*(\d+(?:\s*(?:,|&|\/|-|–|—|\band\b|\bor\b|\bto\b|\bthrough\b)\s*\d+)*)/giu;
/** A range between two numbers of a list. */
const RANGE = /^(?:-|–|—|to|through)$/iu;
/** The most numbers a range is read as naming. */
const RANGE_MOST = 20;

/** The condition numbers a sentence names, in the order first named (header). */
export function automationStudioResultConditionReferences(sentence: string): number[] {
  const text = withoutWordings(sentence);
  const numbers: number[] = [];
  const add = (number: number): void => {
    if (Number.isInteger(number) && number > 0 && !numbers.includes(number)) numbers.push(number);
  };
  for (const match of text.matchAll(ONE)) add(Number(match[1]));
  for (const match of text.matchAll(SEVERAL)) {
    const tokens = match[1]!.match(/\d+|-|–|—|\bto\b|\bthrough\b/giu) ?? [];
    tokens.forEach((token, index) => {
      if (!RANGE.test(token)) return add(Number(token));
      const from = Number(tokens[index - 1]);
      const to = Number(tokens[index + 1]);
      if (Number.isInteger(from) && Number.isInteger(to) && to > from && to - from <= RANGE_MOST) for (let number = from + 1; number < to; number += 1) add(number);
    });
  }
  return numbers;
}

/** The sentence with every bracket whose text reads as a condition's wording taken out, brackets inside it counted. */
function withoutWordings(sentence: string): string {
  let said = "";
  let from = 0;
  for (let open = sentence.indexOf("("); open >= 0; open = sentence.indexOf("(", Math.max(open + 1, from))) {
    if (open < from) continue;
    const close = closing(sentence, open);
    if (close === undefined || !RELATION.test(sentence.slice(open + 1, close))) continue;
    said += sentence.slice(from, open);
    from = close + 1;
  }
  return said + sentence.slice(from);
}

/** Where the bracket opened at `open` closes; none where it never does. */
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
