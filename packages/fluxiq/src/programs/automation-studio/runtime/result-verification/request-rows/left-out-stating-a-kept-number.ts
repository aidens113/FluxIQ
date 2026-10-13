// Rows a text condition alone left out that state a number the same condition
// kept on another row (t478).
//
// **Why.** Lane D round 11 (`run-mv5yaapw-6d20d23d`): a listing kept requests
// with `mutual matches ["([5-9]|[1-9][0-9]+) mutual friend"]`. It kept "23",
// "11" and "5 mutual friends" and left out "Aisha Khan and 4 other mutual
// friends", which Core's own number reader reads as 5. Five judgements had the
// row and its value in front of them, and every yes named the row and still
// sided with the pattern. Prompt wording had failed at this twice (live run
// `run-murwcaj0-40e56557`, R5 and R6), so the contradiction is now Core's to see.
//
// **The rule, and nothing read from the request or a model.** Per read of a run,
// per condition that compares text (`matches`, `contains`, `startsWith`,
// `endsWith`, or `equals` with text) where what it compares against writes a
// digit or a digit class -- a text test written about a number -- each row it
// alone left out is read for the number it states, with the reader every bound
// uses (`readAutomationStudioRecordNumber`), as is every row it kept: the stored
// rows of the record set its read alone collected, in the tested column, and the
// one value the read found on a kept row where the condition says it
// (`(read "…" on a row it kept)`). A left-out row whose number lies within the
// lowest and highest number the kept rows state is flagged. The same condition
// kept that number on one row and rejected it on another, so whatever it was
// meant to keep, it did not read the number.
//
// **What is not flagged.** A text test whose comparison writes no digit is
// about text, not a quantity (`name not contains "charging case"`). A condition
// that also compares a number by `equals` keeps a set of numbers rather than a
// range, so a number between two kept ones may rightly be out. A row the result
// holds anyway is not missing. A read that answered with its unfiltered rows
// kept nothing by its conditions. With no kept row whose number can be read,
// there is no range.
//
// It flags; `verdict.ts` refuses a yes over a flagged row, and the repair is
// told the rows, the numbers and the change (`repair-directive.ts`).

import { readAutomationStudioRecordNumber } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioResultConditionObservation, AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestRowLabel, automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsKeptNumberLeftOut } from "./types.ts";

/** A relation a condition's wording says (`../read-account/condition.ts`), each after a space and before its value. */
const RELATION = /\s(?:not\s+)?(matches|contains|startsWith|endsWith|equals|atLeast|atMost|lessThan|greaterThan|is)\s/gu;
/** The relations that compare a value's text. `equals` does too, where what it is given is text. */
const TEXT_RELATIONS: ReadonlySet<string> = new Set(["matches", "contains", "startsWith", "endsWith"]);
/** A digit, or a regex digit class as a pattern writes it. */
const WRITES_A_NUMBER = /[0-9]|\\d/u;
/** What the condition's wording says its read found on a kept row. */
const FOUND_ON_KEPT = /\(read ("(?:[^"\\]|\\.)*") on a row it kept\)/u;
/** A column key, as the wording names a tested column. */
const COLUMN = /^[A-Za-z_][\w-]*$/u;
/** A left-out row said with its tested value: `label — column: value`. */
const ROW_VALUE = /^.+? — [\p{L}\p{N}_.$@-]{1,64}: (.*)$/su;
/** What an empty or screened tested value reads as. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["(no value)", "(withheld)"]);

/** Each read's text conditions whose left-out rows state a number within the range their kept rows state; none when there are none. */
export function automationStudioResultLeftOutStatingAKeptNumber(summary: AutomationStudioRunResultSummary): AutomationStudioRequestRowsKeptNumberLeftOut[] {
  const { stored } = automationStudioRequestRowsReads(summary);
  const inResult = new Set(stored.flatMap((row) => row.cells));
  return (summary.reads ?? []).flatMap((read) => read.unfiltered ? [] : flagged(read, summary.recordSets, inResult));
}

function flagged(read: AutomationStudioResultReadAccount, sets: readonly AutomationStudioResultRecordSetSummary[], inResult: ReadonlySet<string>): AutomationStudioRequestRowsKeptNumberLeftOut[] {
  const found: AutomationStudioRequestRowsKeptNumberLeftOut[] = [];
  for (const condition of read.conditions ?? []) {
    const rows = condition.leftOutOnlyByThis ?? [];
    const wording = condition.condition;
    if (!rows.length || wording === undefined) continue;
    const parts = textTestAboutANumber(wording);
    if (!parts) continue;
    const kept = keptNumbers(read.nodeId, parts.subject, wording, rows, sets);
    if (!kept.length) continue;
    const low = Math.min(...kept), high = Math.max(...kept);
    const values = leftOutValues(rows, condition.leftOutObservations);
    const hit: Array<{ row: string; number: number }> = [];
    rows.forEach((row, index) => {
      if (inResult.has(automationStudioRequestRowLabel(row))) return;
      const value = values[index];
      const number = value === undefined ? undefined : readAutomationStudioRecordNumber(value);
      if (number !== undefined && number >= low && number <= high) hit.push({ row, number });
    });
    if (hit.length) found.push({ nodeId: read.nodeId, condition: wording, low, high, rows: hit.map((entry) => entry.row), numbers: hit.map((entry) => entry.number) });
  }
  return found;
}

/**
 * The tested subject of a condition whose wording compares text against
 * something that writes a number, or `undefined` for any other condition: one
 * with no such text test, or one that also compares a number by `equals`.
 */
function textTestAboutANumber(wording: string): { subject: string } | undefined {
  // What the read found is quoted page text, never a relation the condition says.
  const bare = wording.replace(FOUND_ON_KEPT, "(read)");
  const relations = [...bare.matchAll(RELATION)];
  if (!relations.length) return undefined;
  const subject = bare.slice(0, relations[0]!.index).trim();
  let aboutANumber = false;
  for (const [index, relation] of relations.entries()) {
    const start = relation.index + relation[0].length;
    const operand = bare.slice(start, relations[index + 1]?.index ?? bare.length).replace(/\s+and$/u, "").trim();
    const key = relation[1]!;
    const text = operand.startsWith("\"") || operand.startsWith("[\"");
    if (key === "equals" && !text) return undefined;
    if ((TEXT_RELATIONS.has(key) || key === "equals") && WRITES_A_NUMBER.test(operand)) aboutANumber = true;
  }
  return aboutANumber ? { subject } : undefined;
}

/**
 * The numbers the rows a condition kept state: the tested column of every
 * stored row the read alone collected, and the value the wording says its read
 * found on a kept row.
 */
function keptNumbers(nodeId: string, subject: string, wording: string, leftOut: readonly string[], sets: readonly AutomationStudioResultRecordSetSummary[]): number[] {
  const values: string[] = [];
  const said = FOUND_ON_KEPT.exec(wording)?.[1];
  if (said !== undefined) values.push(JSON.parse(said) as string);
  const column = subject.replace("(read)", "").trim();
  if (COLUMN.test(column)) {
    const leftOutLabels = new Set(leftOut.map(automationStudioRequestRowLabel));
    for (const set of sets) {
      if (!set.columns.includes(column) || !collectedByThisRead(set, nodeId, leftOutLabels)) continue;
      for (const row of set.sampleRows ?? []) {
        const cell = row[column];
        if (typeof cell === "string") values.push(cell);
        else if (typeof cell === "number") values.push(String(cell));
      }
    }
  }
  return values.map(readAutomationStudioRecordNumber).filter((number): number is number => number !== undefined);
}

/**
 * Whether a record set holds only rows this read kept: every pass it collected
 * is this read's, or, where the set says nothing of its passes, none of its
 * rows is one this condition left out (a set an unfiltered read of the same
 * list collected holds them).
 */
function collectedByThisRead(set: AutomationStudioResultRecordSetSummary, nodeId: string, leftOut: ReadonlySet<string>): boolean {
  const passes = set.processing?.passes ?? [];
  if (passes.length) return passes.every((pass) => pass.node === nodeId);
  return !(set.sampleRows ?? []).some((row) => Object.values(row).some((cell) => typeof cell === "string" && leftOut.has(cell)));
}

/** Each left-out row's tested value: the read's own witness where it sent one per row, else the value said after the row's label. */
function leftOutValues(rows: readonly string[], observations: ReadonlyArray<AutomationStudioResultConditionObservation | null> | undefined): Array<string | undefined> {
  const witnessed = Array.isArray(observations) && observations.length === rows.length ? observations : undefined;
  return rows.map((row, index) => {
    const witness = witnessed?.[index];
    if (witness) return witness.state === "present" && witness.value.trim() ? witness.value : undefined;
    const value = ROW_VALUE.exec(row)?.[1]?.trim();
    return value && !NOT_A_VALUE.has(value) ? value : undefined;
  });
}
