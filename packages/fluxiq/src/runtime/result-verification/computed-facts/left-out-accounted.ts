// Every row a read left out, alone or by several conditions together, under an
// exclusion the request itself states (framework plan P5, K4; debug of
// `run-mvtdoyf3-47ffaac1`, F1).
//
// **Why.** "Search the catalog for garden books and list every result on the
// first page, leaving out reference copies" asks for every row the search
// shows, less the one exclusion it states. A read that also left out a wall
// calendar, by two conditions the request never states, returned an answer
// short of a row it asks for, and three yeses that named the row with a reason
// of their own were taken: no one condition left it out, so no check held it.
// Core can measure this itself, from its own record of the read and the
// request's own words, before any judge is asked.
//
// **Only where the request asks for every result**
// (`../asked-words/every-result.ts`). There the words it searched by say where
// to look, and every row the read saw is asked for unless the request's own
// words leave it out. A request for a kind of thing ("Find garden gloves")
// names its cohort itself, and whether a row is of it is the judge's: no fact.
//
// **Each left-out row, by the conditions that left it out**
// (`../request-rows/summary-reads.ts`): one condition's rows, or the rows two
// or more left out together, from a run's reads and saved answers and from a
// build test's replayed reads. A row whose label is also in the result is not
// missing from it and is not weighed. Per row, each condition is one of three:
//
// - **stated**: a presence test that keeps the rows lacking a value, or a
//   negated literal text test, whose text the request says after an exclusion
//   cue (`../asked-words/request-exclusion-test.ts`, t660), by Core's read of
//   that row; or another condition, positive, every word of which -- the
//   answer's columns aside -- and every number of which the request says as
//   its own words (`../request-rows/request-wording.ts`, the searched words
//   not counting);
// - **unstated**: its sender gave its whole wording, it tests by something,
//   and not one of its words, the value Core's read found on the row, or its
//   numbers runs in the request as the request's own (the searched words and
//   the words any list request uses not counting);
// - **undecided**: anything else -- a build test's condition named by its
//   field alone, a withheld wording, a text the request says but not as an
//   exclusion ("including reference copies").
//
// A row is accounted for where any condition that left it out is stated, and
// unaccounted for where every one is unstated. One unaccounted row makes the
// fact `fails`, with one `asked_missing` defect per such row: the row by
// Core's label, the column its conditions tested where they agree on one, and
// the request's every-result clause as the words it falls under. Every row
// accounted for makes it `holds`. Anything else, and no row left out at all,
// gives no fact: what Core cannot decide it does not claim.

import type { AutomationStudioResultComputedDefect, AutomationStudioResultComputedFact, AutomationStudioResultComputedFactsInput } from "../contracts/index.ts";
import { automationStudioRequestAsksEveryResult, automationStudioRequestConditionWords, automationStudioResultRequestExclusionTest } from "../asked-words/index.ts";
import {
  automationStudioRequestRowWordCarries,
  automationStudioRequestRowWords,
  automationStudioRequestRowsReads,
  automationStudioRequestWording,
  type AutomationStudioRequestRowsCondition,
  type AutomationStudioRequestRowsTest,
  type AutomationStudioRequestWording
} from "../request-rows/index.ts";

/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";
/** A left-out row said with the column its condition tested (`../read-account/alone-rows.ts`). */
const TESTED_COLUMN = /^.+? — ([\p{L}\p{N}_.$@-]{1,64}): /su;
/** A wording whose subject is one column, before its relation (`../read-account/condition.ts`). */
const WORDING_COLUMN = /^([\p{L}\p{N}_.$@-]{1,64})(?: \(read .*?\))? (?:not )?[a-z][A-Za-z_]*(?: |$)/su;
/** A negated wording, or one that keeps the rows lacking a value: t660's shapes, never held by its words alone (header). */
const NOT_POSITIVE = / not [a-z]| is absent\b/u;
/** The words that name what a condition reads rather than what it tests by, which alone say nothing of the request's. */
const KIND_WORDS: ReadonlySet<string> = new Set(["item", "value", "row", "column", "field"]);
/** The most conditions and rows `said` names, the rest counted. */
const SAID_GROUPS = 4;
const SAID_ROWS = 3;

/** How one condition stands to the request, for one row (header). */
type Standing = { by: "stated"; words: string[] } | { by: "unstated" } | { by: "undecided" };

/** One left-out row with how it stands, and the condition that left it out as every line names it. */
type Weighed = { label: string; condition: string; column?: string; standing: Standing };

/** Every row a read left out, alone or together, under an exclusion the request itself states (header). None where Core cannot compute it. */
export function automationStudioResultLeftOutAccountedFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  if (!automationStudioRequestAsksEveryResult(input.requestText)) return [];
  const wording = automationStudioRequestWording(input.instructions, input.summary);
  if (!wording) return [];
  const answerColumns = new Set(input.summary.recordSets.flatMap((set) => set.columns).flatMap(wordsOf));
  const weighed = automationStudioRequestRowsReads(input.summary, false, { together: true }).reads.flatMap((read) => {
    const inResult = new Set(read.inResult);
    return read.conditions.flatMap((condition) => condition.rows.flatMap((row, index): Weighed[] => {
      const label = condition.labels[index]!;
      if (inResult.has(label)) return [];
      const column = columnOf(condition, row);
      const standing = label === WITHHELD_LABEL || !label.trim()
        ? { by: "undecided" as const }
        : rowStanding(condition, condition.witnesses?.[index], { wording, requestText: input.requestText, answerColumns });
      return [{ label, condition: condition.condition, ...(column ? { column } : {}), standing }];
    }));
  });
  if (!weighed.length) return [];
  const clause = everyResultClause(input.requestText);
  const missing = weighed.filter((row) => row.standing.by === "unstated");
  if (missing.length) {
    const defects = unique(missing, (row) => `${row.label}\n${row.column ?? ""}`).map((row): AutomationStudioResultComputedDefect => ({
      kind: "asked_missing", row: row.label, ...(row.column ? { column: row.column } : {}), requestWords: clause
    }));
    return [{ kind: "left_out_accounted", status: "fails", said: failsSaid(clause, missing), defects }];
  }
  if (!weighed.every((row) => row.standing.by === "stated")) return [];
  return [{ kind: "left_out_accounted", status: "holds", said: holdsSaid(clause, weighed) }];
}

/** How a row stands where these conditions left it out (header): stated by any, unstated by all, else undecided. */
function rowStanding(condition: AutomationStudioRequestRowsCondition, witness: string | undefined, against: { wording: AutomationStudioRequestWording; requestText: string; answerColumns: ReadonlySet<string> }): Standing {
  const tests = condition.tests ?? [];
  if (!tests.length) return { by: "undecided" };
  const standings = tests.map((test) => testStanding(test, witness, against));
  const stated = standings.find((standing): standing is Extract<Standing, { by: "stated" }> => standing.by === "stated");
  if (stated) return stated;
  return standings.every((standing) => standing.by === "unstated") ? { by: "unstated" } : { by: "undecided" };
}

/** How one condition stands to the request, for a row whose witness Core read as `witness` (header). */
function testStanding(test: AutomationStudioRequestRowsTest, witness: string | undefined, against: { wording: AutomationStudioRequestWording; requestText: string; answerColumns: ReadonlySet<string> }): Standing {
  const { wording, requestText, answerColumns } = against;
  const excluded = automationStudioResultRequestExclusionTest(test.wording, witness, requestText, wording.says);
  if (excluded?.length) return { by: "stated", words: excluded };
  const words = automationStudioRequestConditionWords(test);
  if (!words?.whole) return { by: "undecided" };
  const own = wording.ownWords(words.text);
  const ownSaid = own.filter((word) => wording.has(word));
  const numbersSaid = words.numbers.filter((number) => wording.has(number));
  const witnessSaid = witness ? wording.ownWords(witness).filter((word) => wording.has(word)) : [];
  const testsBy = wordsOf(words.text).some((word) => !KIND_WORDS.has(word)) || words.numbers.length > 0;
  if (testsBy && !ownSaid.length && !numbersSaid.length && !witnessSaid.length) return { by: "unstated" };
  // A positive condition the request's own words say whole (header).
  const named = own.filter((word) => !answerColumns.has(word));
  if (!NOT_POSITIVE.test(test.wording ?? "") && named.length && named.every((word) => wording.has(word)) && numbersSaid.length === words.numbers.length) {
    return { by: "stated", words: [...new Set([...named, ...words.numbers])] };
  }
  return { by: "undecided" };
}

/** The column a condition's row was tested in: said after the row, or its wording's or field's one column, where every condition that left it out agrees on it. */
function columnOf(condition: AutomationStudioRequestRowsCondition, row: string): string | undefined {
  const said = TESTED_COLUMN.exec(row)?.[1];
  if (said) return said;
  const columns = (condition.tests ?? []).map((test) => test.field ?? WORDING_COLUMN.exec(test.wording ?? "")?.[1]);
  const [first] = columns;
  return first !== undefined && columns.every((column) => column === first) ? first : undefined;
}

/**
 * The request's clause that asks for every result, as it writes it: the
 * shortest of its parts between an "and" or a "then", then of its clauses,
 * then of its sentences, that the every-result reading finds in alone, less a
 * leading "and" or "then"; the whole request where none alone carries it.
 */
function everyResultClause(requestText: string): string {
  for (const pattern of [/[,;:.!?\n]+|\s+(?:and|then)\s+/iu, /[,;:.!?\n]+/u, /[.!?\n]+/u]) {
    const found = requestText.split(pattern).map((part) => part.trim()).filter((part) => part && automationStudioRequestAsksEveryResult(part))
      .sort((a, b) => a.length - b.length)[0];
    if (found) return found.replace(/^(?:and|then)\s+/iu, "");
  }
  return requestText.trim();
}

function failsSaid(clause: string, missing: readonly Weighed[]): string {
  const groups = grouped(missing);
  const listed = groups.slice(0, SAID_GROUPS).map(([condition, rows]) => {
    const named = rows.slice(0, SAID_ROWS).map((row) => `"${row}"`).join(", ");
    return `${condition} left out ${named}${rows.length > SAID_ROWS ? ` and ${rows.length - SAID_ROWS} more` : ""}`;
  });
  const more = groups.length > SAID_GROUPS ? `; and ${groups.length - SAID_GROUPS} more conditions` : "";
  const count = new Set(missing.map((row) => row.label)).size;
  return `Core's check: the request asks for every result ("${clause}"), and no words of its own leave out ${count === 1 ? "this row" : `these ${count} rows`} a read left out of the result: `
    + `${listed.join("; ")}${more}. Not one word of these conditions is the request's own, so each row is a result the request asks for and the answer lacks it.`;
}

function holdsSaid(clause: string, weighed: readonly Weighed[]): string {
  const by = new Map<string, Set<string>>();
  for (const row of weighed) if (row.standing.by === "stated") for (const word of row.standing.words) by.set(row.condition, (by.get(row.condition) ?? new Set()).add(word));
  const listed = [...by].slice(0, SAID_GROUPS).map(([condition, words]) => `${condition}, by the request's "${[...words].join("\", \"")}"`);
  const more = by.size > SAID_GROUPS ? `; and ${by.size - SAID_GROUPS} more conditions` : "";
  const count = new Set(weighed.map((row) => row.label)).size;
  return `Core's check: the request asks for every result ("${clause}"), and each of the ${count} rows a read left out that the result does not hold falls under an exclusion the request itself states: `
    + `${listed.join("; ")}${more}. Core settled this; it need not be decided again.`;
}

/** The labels each condition left out, in order, once each. */
function grouped(rows: readonly Weighed[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const labels = groups.get(row.condition) ?? [];
    if (!labels.includes(row.label)) labels.push(row.label);
    groups.set(row.condition, labels);
  }
  return [...groups];
}

function unique<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const one = key(value);
    if (seen.has(one)) return false;
    seen.add(one);
    return true;
  });
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).filter((word) => automationStudioRequestRowWordCarries(word.word)).map((word) => word.word);
}
