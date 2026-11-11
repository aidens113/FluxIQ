// What an attempt got, made sendable and put in today's summary's places, so that
// what today's judge is told of a record set and an end view, and how its yes is
// checked against stored cells, hold here too.
//
// Rows come off a medium Core does not know, so they are screened as a finished
// run's are (`../result-summary.ts`): a denied or credential-shaped column carries
// no values, a value shaped like a credential is replaced by a marker, and a view
// holding either is not sent. `withheld` says so, so the judge is never shown a
// screened picture that reads as a whole one.
//
// **Two copies.** `read` is a full summary for Core's readers of a verdict, which
// expect `flowShape`, here empty. `sent` is what the model sees, which leaves that
// key out and adds the acts, the model's words, the witnesses, what looks found after the acts
// (screened and bounded again, `lookedShown`) and, on a repeat the person asked
// for, what that means (`./asked-again.ts`): the summary's type
// has no field for those and the channel carries it whole
// (`../../llm/harness/context-packet.ts`), so it is cast at this one place.

import type { JsonObject } from "../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultEndView } from "../result-summary.ts";
import { automationStudioJudgeCriteriaText, automationStudioOverriddenText } from "../../run-overrides/index.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN } from "./asked-again.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION } from "./question.ts";
import { automationStudioFlowLessReadPagesShown } from "./read-pages-shown.ts";
import { automationStudioFlowLessScreenedWords } from "./screened-words.ts";
import type { AutomationStudioFlowLessSummary } from "./types.ts";

/** Stands in for a value that may not be sent, as a finished run's rows say it. */
const WITHHELD_VALUE = "[withheld]";
/** Words the screen dropped whole. */
const WITHHELD_WORDS = "(withheld)";
const ANSWER_NOTE = "The model's own words, not evidence.";
/** The latest looks the judge is shown, and how much of each: the completion check's own bounds (`SVC/answer-first/completion/check.ts`). */
const LOOKS_SHOWN = 6;
const FOUND_CHARS = 600;
const WHERE_CHARS = 300;

/** The rows' one record set has no dataset id here: the writer's result names the real one. */
const SET_ID = "result";

export function automationStudioFlowLessJudgedSummary(summary: AutomationStudioFlowLessSummary, deniedEvidenceKeys: readonly string[]): { read: AutomationStudioRunResultSummary; sent: AutomationStudioRunResultSummary } {
  const rows = summary.rows ? screenedSet(summary.rows, deniedEvidenceKeys) : undefined;
  const ended = summary.endView ? automationStudioResultEndView(summary.endView, deniedEvidenceKeys) : { withheld: false };
  const before = witness(summary.witnesses?.before, deniedEvidenceKeys);
  const after = witness(summary.witnesses?.after, deniedEvidenceKeys);
  const answer = summary.answerText === undefined ? { withheld: false } : automationStudioFlowLessScreenedWords(summary.answerText);
  const acts = summary.acts.map((act) => ({ what: words(act.what), where: words(act.where), classes: [...act.classes], state: act.state }));
  const looked = lookedShown(summary.looked ?? []);
  const readPages = automationStudioFlowLessReadPagesShown(summary, words, deniedEvidenceKeys);
  const withheld = (rows?.withheld ?? false) || ended.withheld || before.withheld || after.withheld || answer.withheld || acts.some((act) => act.what.withheld || act.where.withheld) || looked.withheld || readPages.withheld;
  const read: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows?.set.recordCount ?? 0,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: rows ? 1 : 0,
    recordSets: rows ? [rows.set] : [],
    flowShape: [],
    withheld,
    ...(ended.endView ? { endView: ended.endView } : {})
  };
  const { flowShape: _notShown, ...shown } = read;
  // A run's extra criteria follow the question as a list, and are there only when the run has some.
  const criteria = automationStudioJudgeCriteriaText();
  // The question is an open section (`judge.question`): a run may add to it or put its own in its place.
  const question = automationStudioOverriddenText("prompt", "judge.question", AUTOMATION_STUDIO_FLOW_LESS_QUESTION);
  const sent = {
    question: criteria ? `${question}\n\n${criteria}` : question,
    ...(summary.askedAgain ? { askedAgain: AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN } : {}),
    ...shown,
    ...(rows?.columnLabels ? { columnLabels: rows.columnLabels } : {}),
    acts: acts.map((act) => ({ ...act, what: act.what.text, where: act.where.text })),
    ...(answer.text ? { answerText: { author: "model", note: ANSWER_NOTE, text: answer.text } } : {}),
    ...(before.view || after.view ? { witnesses: { ...(before.view ? { before: before.view } : {}), ...(after.view ? { after: after.view } : {}) } } : {}),
    ...(looked.looks.length ? { looked: looked.looks } : {}),
    ...(readPages.pages.length ? { readPages: readPages.pages, ...(readPages.notShown ? { readPagesNotShown: readPages.notShown } : {}) } : {})
  };
  return { read, sent: sent as unknown as AutomationStudioRunResultSummary };
}

function words(text: string): { text: string; withheld: boolean } {
  const screened = automationStudioFlowLessScreenedWords(text);
  return { text: screened.text ?? WITHHELD_WORDS, withheld: screened.withheld };
}

/**
 * What looks found after the first lasting act (`./types.ts`, `looked`), screened again here whatever
 * screened it before, because this is what leaves for the model: the latest few, each cut short, and an
 * address or a line of what was found that a screen dropped is said as withheld, here or earlier.
 */
function lookedShown(looks: readonly { where: string; found: string }[]): { looks: { where: string; found: string }[]; withheld: boolean } {
  let withheld = false;
  const line = (text: string): string => {
    if (!text.trim()) return text;
    const screened = words(text);
    if (screened.withheld || screened.text === WITHHELD_WORDS) withheld = true;
    return screened.text;
  };
  const shown = looks.slice(-LOOKS_SHOWN).map((look) => ({ where: line(cut(look.where, WHERE_CHARS)), found: cut(look.found, FOUND_CHARS).split("\n").map(line).join("\n") }));
  return { looks: shown, withheld };
}

/** At most `most` characters, by code point, with `…` where it was cut. */
function cut(text: string, most: number): string {
  const characters = [...text];
  return characters.length <= most ? text : `${characters.slice(0, most - 1).join("")}…`;
}

function witness(view: JsonObject | undefined, denied: readonly string[]): { view?: JsonObject; withheld: boolean } {
  if (view === undefined) return { withheld: false };
  const screened = automationStudioResultEndView({ view }, denied);
  return { ...(screened.endView ? { view } : {}), withheld: screened.withheld };
}

/**
 * The rows as a record set, by the smallest copy of `screenedRows`, which
 * `../result-summary.ts` keeps private: with a column's label too, and a column that
 * cannot be sent dropped, because a provider refuses a summary with a credential
 * anywhere in it, a column list included.
 */
function screenedSet(rows: NonNullable<AutomationStudioFlowLessSummary["rows"]>, denied: readonly string[]): { set: AutomationStudioResultRecordSetSummary; columnLabels?: Record<string, string>; withheld: boolean } {
  const declared = rows.columns.length ? rows.columns : [...new Set(rows.rows.flatMap((row) => Object.keys(row)))].map((id) => ({ id, label: id }));
  const sendable = declared.filter((column) => {
    const found = screenAutomationStudioLlmEvidence({ [column.id]: column.label }, denied);
    return !found.deniedKey && !found.secretShaped;
  });
  let withheld = rows.truncated || sendable.length < declared.length;
  const sampleRows = rows.rows.map((row) => {
    const carried: JsonObject = {};
    for (const { id } of sendable) {
      if (!Object.hasOwn(row, id)) continue;
      const value = row[id]!;
      const found = screenAutomationStudioLlmEvidence(value, denied);
      if (found.deniedKey || found.secretShaped || (typeof value === "number" && !Number.isFinite(value))) {
        carried[id] = WITHHELD_VALUE;
        withheld = true;
      } else carried[id] = value;
    }
    return carried;
  });
  const set: AutomationStudioResultRecordSetSummary = {
    datasetId: SET_ID,
    recordCount: Number.isSafeInteger(rows.totalRows) && rows.totalRows >= 0 ? rows.totalRows : sampleRows.length,
    refusedCount: 0,
    truncated: rows.truncated,
    columns: sendable.map((column) => column.id),
    columnsWithheld: false,
    rowsChecked: 0,
    rowsMissingRequired: 0,
    missingRequiredColumns: [],
    ...(sampleRows.length ? { sampleRows } : {})
  };
  const named = sendable.filter((column) => column.label !== column.id);
  return { set, ...(named.length ? { columnLabels: Object.fromEntries(named.map((column) => [column.id, column.label])) } : {}), withheld };
}
