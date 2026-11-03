// A `where` text test of numbers or dates by their characters (t800, P7).
//
// **Why.** A request for "more than three" or "since last spring" is a bound on a number or a date. A
// builder that cannot write the bound writes a text test that spells the numbers or the date out: a
// pattern of digit alternatives (`(4|5|6)`, `[4-9]`), a year or a run of month names. Such a test is
// true of the values on the page today and wrong for the next, and no judge can read the bound out of
// it. So the first submission carrying one is refused once, naming the bound to write (the hint that
// does so is `./hint.ts`); sent again, it is accepted. A text test of words is never
// flagged: only a pattern or value that is made of digits, or of month names and years.
//
// This finds them in an assembled plan, as the other checks here do: any `where` list in any step's
// parameters, and in it a `matches`, `contains`, `startsWith` or `endsWith` whose value (or any of a
// list) reads as a number or a date by its characters. Pure and generic; names no site.

/** The text tests that match characters. */
const TEXT_TESTS: readonly string[] = ["matches", "contains", "startsWith", "endsWith"];
const MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/giu;
/** A year spelled out, whole or as the regex that spells it. */
const YEAR = /(?<!\d)(?:19|20)\d\d(?!\d)|\((?:\?:)?19\|20\)\\d\\d|\\d\{4\}/u;
/** Digits joined as a date: 3/14, 2024-05-01, or the regex that spells one. */
const DATE_SHAPE = /(?<!\d)\d{1,4}[/-]\d{1,2}[/-]\d{1,4}(?!\d)|(?<!\d)\d{1,2}\/\d{1,2}(?!\d)|\\d\{4\}\s*-\s*\\d|\\d\{1,2\}\s*\/\s*\\d/u;
/** A class or escape that stands for digits. */
const DIGIT_CLASS = /\\d|\[[^\]]*\d\s*-\s*\d[^\]]*\]|\[:digit:\]/u;
/** A value that is only a number: digits with the marks a number carries. */
const PLAIN_NUMBER = /^[\s$€£¥+-]*\d[\d\s.,]*%?\s*$/u;
/** Alternatives separated by a bar, each a bare number. */
const NUMBER_ALTERNATIVE = /^[\s$€£¥]*\d[\d.,]*%?\s*$/u;

/** One text test of numbers or dates by characters: where, how it is tested, what it tests, and which bound to write. */
export type AutomationStudioNumericTextTest = {
  field?: string;
  test: string;
  pattern: string;
  kind: "number" | "date";
};

/** Every such test in `plan`'s `where` lists (header); empty where there is none. */
export function automationStudioFlowPlanNumericTextTests(plan: { subflows: ReadonlyArray<{ nodes: ReadonlyArray<{ parameters?: unknown }> }> }): AutomationStudioNumericTextTest[] {
  const found: AutomationStudioNumericTextTest[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "where" && Array.isArray(entry)) for (const condition of entry) testsOf(condition, found);
      visit(entry);
    }
  };
  for (const subflow of plan.subflows) for (const node of subflow.nodes) visit(node.parameters);
  return found;
}

function testsOf(condition: unknown, found: AutomationStudioNumericTextTest[]): void {
  if (!isRecord(condition)) return;
  for (const test of TEXT_TESTS) {
    const values = texts(condition[test]);
    const kind = kindOf(values);
    if (!kind) continue;
    found.push({ ...(typeof condition.field === "string" ? { field: condition.field } : {}), test, pattern: values.join(" | "), kind });
  }
}

/** Whether `values` (one value, or a list meaning any) test numbers or dates by characters; which, where they do. */
function kindOf(values: readonly string[]): "number" | "date" | undefined {
  if (!values.length) return undefined;
  const joined = values.join("|");
  const months = new Set((joined.match(MONTH) ?? []).map((month) => month.toLowerCase().slice(0, 3)));
  if (months.size >= 2 || (months.size === 1 && /\d/u.test(joined))) return "date";
  if (values.some((value) => YEAR.test(value) || DATE_SHAPE.test(value)) && !values.some(wordy)) return "date";
  // A list of bare numbers is digit alternatives; so is a pattern with a digit class or numeric alternatives.
  if (values.length >= 2 && values.every((value) => NUMBER_ALTERNATIVE.test(value))) return "number";
  return values.some(numeric) ? "number" : undefined;
}

function numeric(value: string): boolean {
  if (PLAIN_NUMBER.test(value)) return true;
  if (DIGIT_CLASS.test(value) && !wordy(value)) return true;
  const alternatives = value.replace(/^[\\^()?:\s]+|[\\$()\s]+$/gu, "").split("|");
  return alternatives.length >= 2 && alternatives.filter((alternative) => NUMBER_ALTERNATIVE.test(alternative.replace(/[\\b()^$?:]/gu, ""))).length >= 2;
}

/** A value with a word in it (a run of two or more letters outside a regex escape): a test of words, not of a date's digits. */
function wordy(value: string): boolean {
  return /(?<![\\\w])[A-Za-z]{2,}/u.test(value.replace(/\\[A-Za-z]/gu, ""));
}

function texts(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
