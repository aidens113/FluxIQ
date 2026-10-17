// Core's record of one build test judged no, kept for the gate that keeps a
// build's trials (t633, `./index.ts`): what the result stored and was read
// with, the stored rows a standing no called not the kind of thing asked for,
// and the conditions each standing no's advice asks to remove.
//
// **Which nos stand.** A no's call whose reading Core's record wholly refutes
// (`../refuted-no/weigh.ts`, t607, t631) is not taken, so it is not one: what
// it said is neither kept nor held to.
//
// **What a standing no upheld.** The stored rows its reading names that an
// exclusion of its advice says what they are -- t628's path,
// `automationStudioRequestKindExclusionLabels`: "exclude <kind>" where the kind
// is a word of the row's own label. Nothing is read of what the judge meant
// beyond those words; the labels are Core's own, matched in its record.
//
// **What a standing no asks to remove.** The conditions its advice changes,
// removes or loosens and nothing else (`automationStudioResultAdviceChangedConditions`,
// t631's reading, without its clearance), where its observed reading names no
// row Core holds and none it has no record of: a quote of a text one of the
// result's own conditions tests is no row. A no that names a row, or asks for
// anything else, has no such remedy, and is never weighed by one.
//
// **What each condition kept out (t641).** Each condition also says where it
// stands (`nodeId`, `number`), and, where it alone left out at least one row
// and Core's record accounts for every one -- another copy of it in the
// result, or a value Core read on it failing the request's own words
// (`../refuted-no/record-conditions.ts`) -- those rows (`keptOut`): it left out
// nothing the request asks for, whatever the judges said of it. The gate keeps
// such conditions across the build's trials (`../standing-no/kept-conditions.ts`).
//
// **And the conditions that left rows out only together (t666).** Each read's
// sets of conditions that left rows out only together, where its listing of
// them is complete (`../refuted-no/record.ts`, `together`), with those rows,
// and, where another copy of every one is in the result, those rows as kept
// out (`keptOut`). Together rows carry no value Core read, so the request's
// words never account for one here. The gate keeps such a set as one.
//
// **And the conditions written in the request's own exclusion words (t687).**
// Each condition that leaves rows out for having something says, where Core's
// record measured it (`./request-exclusion.ts`), the request's words it leaves
// rows out by (`excludes`), or the rows it left out on which Core read a value
// the request does not say to leave out (`askedFor`). The gate keeps the first
// across the build's trials whether or not Core accounts for every row, and
// releases it only on the second.

import type { AutomationStudioRunResultSummary, AutomationStudioResultVerification } from "../contracts/index.ts";
import {
  automationStudioResultAdviceChangedConditions,
  automationStudioResultReadingSentences,
  automationStudioResultRefutedReading,
  automationStudioResultSentenceRows,
  automationStudioResultWithoutConditionWording,
  type AutomationStudioResultNoCondition,
  type AutomationStudioResultNoRecord
} from "../refuted-no/index.ts";
import { automationStudioRequestKindExclusionLabels, automationStudioRequestRowLabel, type AutomationStudioRequestWording } from "../request-rows/index.ts";
import { automationStudioResultNamedStoredLabels } from "./named-stored.ts";
import { automationStudioResultConditionRequestExclusion } from "./request-exclusion.ts";
import type { AutomationStudioResultStandingNoCall, AutomationStudioResultStandingNoKeptOutRow, AutomationStudioResultStandingNoRecord, AutomationStudioResultStandingNoTogether } from "../standing-no/index.ts";

/** Core's aside on the value a condition read on a kept row (`../read-account/condition.ts`): it may differ between revisions. */
const KEPT_ROW_ASIDE = /\s*\(read\s.*?\son\sa\srow\sit\skept\)/giu;
/** A quoted run of text. */
const QUOTED = /["“]([^"”]+)["”]/gu;

/** The record of a no over `summary` (header), from the two calls that judged it. */
export function automationStudioResultStandingNoRecord(input: {
  calls: ReadonlyArray<{ call: 1 | 2; verification: AutomationStudioResultVerification }>;
  record: AutomationStudioResultNoRecord;
  summary: AutomationStudioRunResultSummary;
  wording?: AutomationStudioRequestWording | undefined;
}): AutomationStudioResultStandingNoRecord {
  const { record, summary, wording } = input;
  const standing: AutomationStudioResultStandingNoCall[] = [];
  const upheld = new Set<string>();
  for (const { call, verification } of input.calls) {
    const reading = verification.basis === "model" && verification.verdict === "does_not_answer" ? verification.repair?.judgement : undefined;
    if (!reading || automationStudioResultRefutedReading(reading, record).wholly) continue;
    if (wording) for (const label of automationStudioRequestKindExclusionLabels(reading.advice, wording, automationStudioResultNamedStoredLabels(reading, record))) upheld.add(label);
    const changed = automationStudioResultAdviceChangedConditions(reading.advice, record);
    const drops = changed && namesNoRow(reading.observed, record) ? keysOf(changed) : undefined;
    standing.push({ call, ...(drops ? { drops } : {}) });
  }
  const stored = [...new Set(record.stored.map((row) => row.label))];
  const together = togetherOf(summary, record, new Set(stored));
  return {
    stored,
    storedWhole: storedWhole(summary, record),
    conditions: (record.conditions ?? []).map((condition) => {
      const keptOut = keptOutOf(condition);
      return {
        name: condition.name,
        ...(condition.wording ? { key: conditionKey(condition.wording) } : {}),
        ...(condition.leftOut ? { leftOutAlone: condition.leftOut.map((row) => row.label) } : {}),
        nodeId: condition.nodeId,
        number: condition.number,
        ...(keptOut ? { keptOut } : {}),
        ...automationStudioResultConditionRequestExclusion(condition, record, summary)
      };
    }),
    ...(upheld.size ? { upheldKind: [...upheld] } : {}),
    standing,
    ...(together.length ? { together } : {})
  };
}

/**
 * Each set of conditions that left rows out only together, of each read whose
 * listing of them is complete (header, t666): its rows, and those rows as kept
 * out where another copy of every one is in the result.
 */
function togetherOf(summary: AutomationStudioRunResultSummary, record: AutomationStudioResultNoRecord, stored: ReadonlySet<string>): AutomationStudioResultStandingNoTogether[] {
  return (record.together ?? []).flatMap(({ nodeId, sets }) => {
    const listed = (summary.reads ?? []).find((read) => read.nodeId === nodeId)?.leftOutTogether ?? [];
    // `sets` is that listing's conditions, in its order (`../refuted-no/record.ts`).
    return sets.map((numbers, index) => {
      const rows = (listed[index]?.rows ?? []).map(automationStudioRequestRowLabel);
      const kept = rows.length > 0 && rows.every((label) => stored.has(label));
      return { nodeId, numbers: [...numbers], rows, ...(kept ? { keptOut: rows.map((label) => ({ label, by: "also_in_result" as const })) } : {}) };
    });
  });
}

/**
 * The rows a condition alone left out, where there is at least one and Core's
 * record accounts for every one (header, t641): it left out nothing the
 * request asks for. Nothing otherwise.
 */
function keptOutOf(condition: AutomationStudioResultNoCondition): AutomationStudioResultStandingNoKeptOutRow[] | undefined {
  const rows = condition.leftOut ?? [];
  if (!rows.length || rows.some((row) => !row.accounted)) return undefined;
  return rows.map((row) => row.accounted!.by === "request_words" ? { label: row.label, by: "request_words" as const, texts: [...row.accounted!.texts] } : { label: row.label, by: "also_in_result" as const });
}

/** A condition's wording as revisions are compared by (`./types.ts`, `key`). */
function conditionKey(wording: string): string {
  return wording.replace(KEPT_ROW_ASIDE, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** The keys of the conditions an advice changes; none where any lacks a wording to compare. */
function keysOf(conditions: readonly AutomationStudioResultNoCondition[]): string[] | undefined {
  if (conditions.some((condition) => !condition.wording)) return undefined;
  return [...new Set(conditions.map((condition) => conditionKey(condition.wording!)))];
}

/** Whether every row the result stored is one of the record's: nothing cut short, nothing a build test's store counts apart (header). */
function storedWhole(summary: AutomationStudioRunResultSummary, record: AutomationStudioResultNoRecord): boolean {
  if (summary.buildTest?.stores?.length) return false;
  const counted = summary.recordSets.reduce((total, set) => total + set.recordCount, 0);
  return summary.recordSets.every((set) => !set.truncated) && record.stored.length === counted;
}

/**
 * Whether no sentence of an observed reading names a row Core holds, or one it
 * has no record of, once Core's wording of the conditions it names and every
 * quote of a text a condition of the result tests are taken out (header).
 */
function namesNoRow(observed: string | undefined, record: AutomationStudioResultNoRecord): boolean {
  const tested = new Set((record.conditions ?? []).flatMap((condition) => [...(condition.wording ?? "").matchAll(QUOTED)].map((quote) => fold(quote[1]!))));
  return automationStudioResultReadingSentences(observed).every((sentence) => {
    const plain = automationStudioResultWithoutConditionWording(sentence).replace(QUOTED, (quote, text: string) => (tested.has(fold(text)) ? "" : quote));
    const named = automationStudioResultSentenceRows(plain, record);
    return !named.stored.length && !named.leftOut.length && !named.unmatched;
  });
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}
