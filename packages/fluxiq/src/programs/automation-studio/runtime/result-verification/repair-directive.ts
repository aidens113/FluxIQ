// What a refutation tells the repair to fix.
//
// Until now a refutation was a verdict and a code. Five consecutive live runs on
// 2026-09-26 were refuted as `core.result.does_not_answer_request` -- which was
// the right verdict every time -- and that string was the whole of what reached
// the repair. So the repair began again from nothing: a second full exploration
// to rediscover a defect the judgement had already seen, and on the one run that
// reached the model it produced no correction at all.
//
// The judgement is the cheapest place in the loop to turn an observation into an
// instruction. It has the request, the Flow, the run and the data in front of it;
// the repair has to go and fetch them again. So the refutation now carries what
// is wrong with the data and what to do about it.
//
// **Two provenances, kept apart.** `findings` and `fix` are Core's own:
// arithmetic over the summary Core already holds, and one sentence per finding
// that Core wrote. `judgement` is the model's reading of the request, screened.
// The split is not bookkeeping -- `verdict.ts` records Core's words onto a run
// and never a model's prose, and that rule survives here: `run-outcome.ts`
// records `findings` and `fix`, while `judgement` travels to the repair inside
// the failure record's `expected` and `actual`, which is where a sentence written
// outside Core has always travelled (`llm/harness/locator-text.ts`).
//
// **Nothing new is demanded of the model, and that is the design.** There is no
// new response field, no new schema key and no new parse: `judgement` is read off
// the `expected`, `observed` and `changed` the diagnosis channel already carries
// and already bounds. A field that is absent, oversized, wrongly typed or refused
// by a screen is simply not in the directive. A judgement that answers `no` and
// says nothing else still produces a refutation with Core's findings in it, and a
// judgement whose prose is unusable costs the verdict nothing -- which is the
// whole point of reading it forgivingly rather than requiring it.
//
// **What Core will and will not claim.** Every finding here is a count or a
// comparison over values Core already has: rows stored, rows refused, rows
// lacking a value their own schema requires, a column empty in every row
// sampled, rows identical to each other. Core does not read the request. Which
// clause of the instruction went unapplied is the judgement's to say, because the
// judgement is the only party in this module's world that was shown the request.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import type {
  AutomationStudioResultLeftOutNamingTheItem,
  AutomationStudioResultRepairDirective,
  AutomationStudioResultRepairFinding,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultReadEmptiedColumns } from "./read-account/index.ts";

/** Core's stable codes for what it found wrong with a result. */
export const AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES = Object.freeze({
  /** The run kept no record set at all. */
  noRecordSet: "result.no_record_set",
  /** Rows were found and record validation refused every one of them. */
  everyRowRefused: "result.every_row_refused",
  /** Nothing stored and nothing refused: the step that reads rows found none. */
  noRecordsStored: "result.no_records_stored",
  /** Stored rows lack a value for a field the Flow's own schema declares required. */
  requiredValuesMissing: "result.required_values_missing",
  /** A column carries no value in any row sampled. */
  columnAlwaysEmpty: "result.column_always_empty",
  /** Every row sampled from one set is the same row. */
  rowsIdentical: "result.rows_identical",
  /** The set holds more rows than the record output keeps. */
  recordsTruncated: "result.records_truncated",
  /** Part of the account the verdict was reached from was cut to fit. */
  summaryWithheld: "result.summary_withheld",
  /** Nothing in the counts is wrong, so what is wrong is which rows or values were kept. */
  countsLookRight: "result.counts_look_right",
  /** The Flow reads and stores nothing, so what is wrong is an act its steps did not do, or did differently. */
  actsJudgedUndone: "result.acts_judged_undone",
  /**
   * A yes that did not account, row by row, for rows a condition alone left out
   * that name the asked item first (`request-rows/`, live run
   * `run-muw60j7c-bb7c9a62`): set only where `verdict.ts` does not take that yes.
   */
  leftOutNamingTheItem: "result.left_out_naming_the_item"
} as const);

// **Whole.** Every finding, every fix line, every column and every word of the
// judgement reach the repair. Until 2026-09-30 the directive held itself to 8
// findings, 8 fix lines of 300 characters, 240-character details, 8 columns a
// finding and a 500-character judgement (user: "Remove ANY AND ALL LIMITS ON
// THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION").

/** What the model said, as the verdict reader hands it over: read forgivingly, never required. */
export type AutomationStudioResultJudgementText = {
  /** The model's `expected`: what it took the request to ask for. */
  expected?: unknown;
  /** The model's `observed`: what it compared that against. */
  observed?: unknown;
  /** The model's advice, read from `changed` and falling back to the reply's own summary. */
  advice?: unknown;
  /**
   * The model's `stillAchievable`: whether what was asked can still be had. A
   * build ends "not doable" only on its `no` (t195-w37, live run
   * `run-murwcaj0-40e56557`); anything but the three words is dropped.
   */
  stillAchievable?: unknown;
};

/** The three words `stillAchievable` may carry; any other value is not carried. */
const STILL_ACHIEVABLE = ["yes", "no", "unknown"] as const;

export type AutomationStudioResultRepairDirectiveInput = {
  summary: AutomationStudioRunResultSummary;
  /** What the model said, when a model was asked and answered anything. */
  judgement?: AutomationStudioResultJudgementText | undefined;
  /**
   * The flagged rows a yes did not name (`request-rows/unaccounted-rows.ts`):
   * each becomes a finding and a fix line naming its condition, the item, the
   * request's other phrases and the rows, so the repair has the rows themselves.
   */
  leftOutUnaccounted?: readonly AutomationStudioResultLeftOutNamingTheItem[] | undefined;
  /** Core's check of the rows the judgement names (`request-rows/checked-rows.ts`), carried as `checked`. */
  checked?: readonly string[] | undefined;
};

/**
 * The directive a refutation carries.
 *
 * Always a directive, never `undefined`: a refutation with no finding and no
 * advice still says what a repair should compare, because "the counts are right
 * and the answer is wrong" is itself the instruction for the case the loop meets
 * most -- a Flow that returned everything when the request asked for some of it.
 */
export function automationStudioResultRepairDirective(input: AutomationStudioResultRepairDirectiveInput): AutomationStudioResultRepairDirective {
  const unaccounted = input.leftOutUnaccounted ?? [];
  // The rows a yes passed over first: they are the most concrete thing wrong, and what the repair acts on.
  const findings = [...unaccounted.map(unaccountedFinding), ...automationStudioResultRepairFindings(input.summary)];
  const fix = [
    ...unaccounted.map(unaccountedFix),
    ...findings
      .map((finding) => fixLine(finding, input.summary))
      .filter((line): line is string => line !== undefined)
  ];
  const judged = screenedJudgement(input.judgement);
  return {
    schemaVersion: "automation-studio.result-repair-directive.v1",
    findings,
    fix,
    ...(judged.judgement ? { judgement: judged.judgement } : {}),
    ...(input.checked?.length ? { checked: [...input.checked] } : {}),
    ...(judged.withheld ? { withheld: true } : {})
  };
}

/**
 * The finding for one condition's flagged rows a yes did not name, in Core's
 * words: where, the condition, the item every kept row names first, the
 * request's phrases each row names after it, and the rows as the read gave them.
 */
function unaccountedFinding(entry: AutomationStudioResultLeftOutNamingTheItem): AutomationStudioResultRepairFinding {
  return {
    code: AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem,
    detail: `${leftOutWhere(entry)}: the condition "${entry.condition}" alone left out ${entry.rows.length === 1 ? "a row whose label names" : `${entry.rows.length} rows whose labels name`} "${entry.item}" first, as every kept row does, and ${quotedList(entry.also)} only after it, and the check answered yes without saying why the request excludes ${entry.rows.length === 1 ? "it" : "each"}: ${entry.rows.join("; ")}.`
  };
}

/** What to do about one condition's flagged rows: decide each by the request, and change the condition that left out the ones it asks for. */
function unaccountedFix(entry: AutomationStudioResultLeftOutNamingTheItem): string {
  return `Decide row by row whether the request excludes each row the condition "${entry.condition}" (${leftOutWhere(entry)}) alone left out that names "${entry.item}" first and ${quotedList(entry.also)} after it -- an item sold with or including something the request leaves out is still the item -- and change that condition so it keeps the rows the request asks for: ${entry.rows.join("; ")}.`;
}

/** Where a flagged condition is: the test's step, or the run's read node. */
function leftOutWhere(entry: AutomationStudioResultLeftOutNamingTheItem): string {
  return entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
}

function quotedList(phrases: readonly string[]): string {
  return phrases.map((phrase) => `"${phrase}"`).join(", ");
}

/**
 * The directive as a run record holds it: Core's findings and Core's fix lines,
 * never the check's prose.
 *
 * It lives beside the directive rather than in the module that writes the run,
 * because how a thing is recorded is part of what the thing is -- and the rule it
 * keeps is this module's: a run's metadata carries Core's words, and the model's
 * reading travels only inside the failure record. `withheld` is recorded because
 * it is a fact about the directive rather than a quotation: it says something the
 * check offered was screened out.
 */
export function automationStudioRecordedResultRepair(repair: AutomationStudioResultRepairDirective): JsonObject {
  return {
    schemaVersion: repair.schemaVersion,
    findings: repair.findings.map((finding) => ({
      code: finding.code,
      detail: finding.detail,
      ...(finding.datasetId ? { datasetId: finding.datasetId } : {}),
      ...(finding.columns?.length ? { columns: [...finding.columns] } : {})
    })),
    fix: [...repair.fix],
    ...(repair.withheld ? { withheld: true } : {})
  };
}

/**
 * What Core's own arithmetic finds wrong with a result.
 *
 * Exported because it is the half of the directive that needs no model at all: a
 * verdict Core settles from its counts (`core-observation.ts`) reaches exactly
 * the same findings, and those refutations now say what to do about themselves
 * for the first time.
 */
export function automationStudioResultRepairFindings(summary: AutomationStudioRunResultSummary): AutomationStudioResultRepairFinding[] {
  const codes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;
  const findings: AutomationStudioResultRepairFinding[] = [];
  if (summary.recordSetCount === 0 && flowReadsNothing(summary)) {
    findings.push({ code: codes.actsJudgedUndone, detail: "The Flow reads no list and stores no records, so its answer is what its steps did on the site: an act the request asks for was not done, or was done differently." });
    if (summary.withheld) findings.push(withheldFinding());
    return findings;
  }
  if (summary.recordSetCount === 0) {
    findings.push({ code: codes.noRecordSet, detail: "The run kept no record set at all, so nothing it read was stored." });
  } else if (summary.totalRecordCount === 0 && summary.totalRefusedCount > 0) {
    findings.push({ code: codes.everyRowRefused, detail: `${summary.totalRefusedCount} ${summary.totalRefusedCount === 1 ? "row was" : "rows were"} found and record validation refused every one, so nothing was stored.` });
  } else if (summary.totalRecordCount === 0) {
    findings.push({ code: codes.noRecordsStored, detail: "Nothing was stored and nothing was refused, so the step that reads rows found none." });
  }
  if (summary.totalRowsMissingRequired > 0) {
    const columns = [...new Set(summary.recordSets.flatMap((set) => set.missingRequiredColumns))];
    findings.push({
      code: codes.requiredValuesMissing,
      detail: `${summary.totalRowsMissingRequired} stored ${summary.totalRowsMissingRequired === 1 ? "row carries" : "rows carry"} no value for a field the Flow's own record schema declares required.`,
      ...(columns.length ? { columns } : {})
    });
  }
  for (const set of summary.recordSets) findings.push(...recordSetFindings(set, summary));
  if (summary.withheld) {
    findings.push(withheldFinding());
  }
  if (!findings.some((finding) => finding.code !== codes.summaryWithheld)) {
    findings.unshift({ code: codes.countsLookRight, detail: "No count is wrong on its own, so what is wrong is which rows, or which values, were kept." });
  }
  return findings;
}

/**
 * The Flow's entry and exit, which the assembler derives from the order of the
 * steps and no build authors or edits (`llm/node-tools/draft-from-flow.ts`
 * keeps the same set out of a seeded draft). A saved Flow ends in its end node,
 * so naming the last node outright pointed a repair at the one step it cannot
 * change (t176).
 */
const DERIVED_CONTROL_NODES: ReadonlySet<string> = new Set(["builtin.control.start", "builtin.control.end"]);

/** Core's own node that writes the records it is handed (`nodes/data/write-records.ts`). */
const RECORD_WRITER = "builtin.data.write-records";

/**
 * Whether the Flow that produced this result reads and stores nothing, so that
 * a run with no record set is the Flow doing what it was built to do.
 *
 * `run-muqiojz4-04a7a8fc` (bigbox cart): a Flow that switched a store and added
 * items to a cart was refuted with `result.no_record_set` and told to "add or
 * fix the step that stores what the Flow read", and its re-author spent the
 * build on list reads the request never asked for instead of the missing Add to
 * cart.
 *
 * Content-free and positive, from what the summary already carries, the same
 * markers the executor reads a node's answer by (`executor/defensive/
 * continuation.ts`, `carriesAnswer`): no read reported itself, no step is Core's
 * record writer, and no step was authored with a record output. True only where
 * every authored step's parameters are in view and none of them under
 * `recordOutput` was withheld -- a step Core cannot see might be the one that
 * stores, so where it cannot tell, the record-set finding stands. A build test
 * keeps every finding as it was: no test stores a record set, and its judge
 * already drops that one (`build-test/judge.ts`).
 */
function flowReadsNothing(summary: AutomationStudioRunResultSummary): boolean {
  if (summary.buildTest || summary.reads?.length || summary.flowParametersWithheld) return false;
  const authored = summary.flowShape.filter((step) => !DERIVED_CONTROL_NODES.has(step.definitionId));
  if (!authored.length) return false;
  return authored.every((step) =>
    step.definitionId !== RECORD_WRITER
    && step.parameters !== undefined
    && (step.parameters.recordOutput === undefined || step.parameters.recordOutput === null)
    && !(step.parametersWithheld ?? []).some((path) => path === "recordOutput" || path.startsWith("recordOutput.")));
}

function withheldFinding(): AutomationStudioResultRepairFinding {
  return { code: AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.summaryWithheld, detail: "Part of the account this verdict was reached from was cut to fit, so the sample is narrower than the counts." };
}

/** What one record set's own numbers and sample say about it. */
function recordSetFindings(set: AutomationStudioResultRecordSetSummary, summary: AutomationStudioRunResultSummary): AutomationStudioResultRepairFinding[] {
  const codes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;
  const findings: AutomationStudioResultRepairFinding[] = [];
  const empty = alwaysEmptyColumns(set, summary);
  if (empty.length) {
    findings.push({
      code: codes.columnAlwaysEmpty,
      detail: `Every row sampled from this record set is empty in ${empty.length === 1 ? "one column" : `${empty.length} columns`}, so what those columns read is not where the value is.`,
      datasetId: set.datasetId,
      columns: empty
    });
  }
  if (identicalSample(set)) {
    findings.push({
      code: codes.rowsIdentical,
      detail: `All ${set.sampleRows?.length ?? 0} rows sampled from this record set are the same row, so the extraction is reading one item repeatedly rather than each row.`,
      datasetId: set.datasetId
    });
  }
  if (set.truncated) {
    findings.push({
      code: codes.recordsTruncated,
      detail: "This record set holds more rows than the record output keeps, so what was judged is a prefix of what the run found.",
      datasetId: set.datasetId
    });
  }
  return findings;
}

/**
 * Columns the sample shows empty in every row.
 *
 * Only where a sample was carried and holds rows: a set with no sample says
 * nothing about its columns, and reporting every column of it as empty would be
 * a finding about the bound rather than about the data. A column already named by
 * the required-value check is left out -- the same defect, said twice, is one
 * instruction the repair reads as two.
 *
 * So is a column a read's own condition keeps empty (`read-account/
 * emptied-columns.ts`): `run-muq66ff9-cb3767a1` filtered on `ad is absent`,
 * stored `ad`, and was told on all three re-authors to re-point a column that
 * was empty because the request asked for exactly that. A column empty for no
 * reason a read states keeps the finding.
 */
function alwaysEmptyColumns(set: AutomationStudioResultRecordSetSummary, summary: AutomationStudioRunResultSummary): string[] {
  const sample = set.sampleRows;
  if (!sample?.length || !set.columns.length) return [];
  const named = new Set([...set.missingRequiredColumns, ...automationStudioResultReadEmptiedColumns(summary.reads, set.columns)]);
  return set.columns
    .filter((column) => !named.has(column) && sample.every((row) => !carriesValue(row, column)));
}

/** Whether every sampled row is the same row. Two rows at least, or there is nothing to compare. */
function identicalSample(set: AutomationStudioResultRecordSetSummary): boolean {
  const sample = set.sampleRows;
  if (!sample || sample.length < 2) return false;
  const first = stableText(sample[0]);
  return first !== undefined && sample.every((row) => stableText(row) === first);
}

/**
 * A row as one comparable string, with its keys in a fixed order.
 *
 * Nothing is caught here. A sampled row has already been through
 * `result-summary.ts`, which keeps only the schema's own columns and replaces a
 * nested or over-long value with a marker, so what arrives is a flat object of
 * JSON scalars. A throw from this would mean that guarantee had broken, and a
 * finding quietly missing is worse than a run that says what could not be read.
 */
function stableText(row: JsonObject | undefined): string | undefined {
  if (!row) return undefined;
  return JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key]]));
}

/** The same reading of "there is a value here" the required-value check uses. */
function carriesValue(row: JsonObject, id: string): boolean {
  if (!Object.hasOwn(row, id)) return false;
  const value = row[id];
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

/**
 * The instruction that follows from one finding, or nothing where the finding is
 * a fact about the account rather than about the Flow.
 *
 * Every line is imperative and names what to change. A repair that reads these
 * and does one of them has done something the loop can judge again; a repair
 * that reads "does not answer the request" has been told to guess.
 */
function fixLine(finding: AutomationStudioResultRepairFinding, summary: AutomationStudioRunResultSummary): string | undefined {
  const codes = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES;
  const columns = finding.columns?.length ? ` (${finding.columns.join(", ")})` : "";
  if (finding.code === codes.noRecordSet) return "Add or fix the step that stores what the Flow read: no record set exists, so nothing the run found was kept.";
  if (finding.code === codes.everyRowRefused) return "Make a found row storable: correct the fields the extraction reads, or stop the record schema requiring a field the page does not carry. Every row found was thrown away by validation.";
  if (finding.code === codes.noRecordsStored) return "Check that the Flow reached the page the request names, then loosen every condition on the step that reads rows before narrowing it again: it found nothing at all.";
  if (finding.code === codes.requiredValuesMissing) return `Point the required fields${columns} at what actually carries their value, or stop declaring them required. Rows were stored with nothing in them.`;
  if (finding.code === codes.columnAlwaysEmpty) return `Re-point the columns${columns} that are empty in every row sampled: what they read is not where that value is.`;
  if (finding.code === codes.rowsIdentical) return "Give the extraction the row container the request describes: it is reading one item over and over instead of each row.";
  if (finding.code === codes.recordsTruncated) return "Raise what the record output keeps, or narrow what is stored, so the answer is the whole result rather than its first rows.";
  if (finding.code === codes.actsJudgedUndone) return "Compare each act the request asks for -- with the item, option, size, quantity and order it names -- against the step that does it, as the check's reading and advice describe: add the step for an act no step does, and correct the parameters of a step that did its act differently.";
  if (finding.code === codes.countsLookRight) return `Compare the request's own terms against the stored columns and the parameters of the steps that decided them${lastStep(summary)}, and change the step whose parameters decide which rows are kept.`;
  return undefined;
}

/** The Flow's last authored step, named as that and not as the step that stored the rows. */
function lastStep(summary: AutomationStudioRunResultSummary): string {
  const step = summary.flowShape.filter((candidate) => !DERIVED_CONTROL_NODES.has(candidate.definitionId)).at(-1);
  return step ? ` -- the Flow's last step is ${step.nodeId} (${step.definitionId})` : "";
}

/**
 * What the model said, every word of it that passes the screens.
 *
 * Read forgivingly on purpose: anything that is not a non-empty string is
 * absent, and nothing here can refuse the verdict. A credential-shaped value is
 * dropped whole, because a sentence that matched one of those shapes has a
 * secret in it and no rewrite makes it safe. A locator-shaped one is rewritten
 * rather than dropped, which is the rule `locator-text.ts` states for exactly
 * this case: these are sentences, and the sentence around a selector is the most
 * informative thing in it. Either way the loss is named in `withheld`, so an
 * absent field and a refused one do not read alike.
 */
function screenedJudgement(judgement: AutomationStudioResultJudgementText | undefined): {
  judgement?: NonNullable<AutomationStudioResultRepairDirective["judgement"]>;
  withheld: boolean;
} {
  if (!judgement) return { withheld: false };
  let withheld = false;
  const carried = (value: unknown): string | undefined => {
    const screened = screenedText(value);
    if (screened.withheld) withheld = true;
    return screened.text;
  };
  const expected = carried(judgement.expected);
  const observed = carried(judgement.observed);
  const advice = carried(judgement.advice);
  // A closed word, not prose: carried only as one of the three, never screened as text.
  const stillAchievable = STILL_ACHIEVABLE.find((word) => word === judgement.stillAchievable);
  const said = {
    ...(expected ? { expected } : {}),
    ...(observed ? { observed } : {}),
    ...(advice ? { advice } : {}),
    ...(stillAchievable ? { stillAchievable } : {})
  };
  return { ...(Object.keys(said).length ? { judgement: said } : {}), withheld };
}

function screenedText(value: unknown): { text?: string; withheld: boolean } {
  if (typeof value !== "string") return { withheld: false };
  const trimmed = value.trim();
  if (!trimmed) return { withheld: false };
  if (screenAutomationStudioLlmEvidence(trimmed, []).secretShaped) return { withheld: true };
  if (!automationStudioLocatorShapedText(trimmed)) return { text: trimmed, withheld: false };
  return { text: automationStudioWithoutLocators(trimmed), withheld: true };
}
