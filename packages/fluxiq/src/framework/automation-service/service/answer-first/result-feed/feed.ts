// The attempt's one result, fed as the attempt goes (lane t905, design (d) phase 2 wiring): the ledger
// (`../result/port.ts`) is the only thing that says which read rows are the answer. The row sink still stores every
// read's rows (`../rows/`); this decides which of them the answer is, the judge reads and the person gets.
//
// **What feeds it, and from where.**
// - **A call** (`../attempt/call-chain.ts`, `called`): a read's rows as the sink stored them. What the latest decision
//   said of it decides what it is (`expect`, from `../attempt/decide.ts`): a call made with `add` is a draft step's page
//   (lead decision D1), a rerun of a kept read is that step's page under its new version, and any other read is a look,
//   which never changes the result. Its answer carries the line `record` gives (the change line, or a look's line).
// - **A run's pass** (`passed`, the forward run's report, `../attempt/round.ts`): the read the chain just stored is that
//   draft step's page; a step that moves a paging loop's list on says that list's paging (`moved`, or `ended` with the
//   words it said).
// - **A saved Flow's run** (`batches`, `../flow-run/flow-run.ts`): each record batch is a page of its node's draft step.
// - **The draft** (`draft`, before every decision and before the save): each kept read step as it now reads, a look the
//   draft took (`take`, or `add` of a look's step), and a read step that left. A draft step's ledger id is the call that
//   first ran it, kept across its reruns (`standsFor`), so a call's page and the draft's step meet under one id.
// - **A carry-on** (`carried`): the rows an earlier segment found, as the output step's page, marked carried.
//
// **A row repeated whole is one row** in the answer (a feed that pins one row to every page), as the store's default
// processing dedupes a run's rows: never a cut, only the same row once.
//
// **A read's declared processing shapes the answer** as a saved run's record output would (t869, run-mw37vz9n): the
// output step's own `recordOutput.process` (a sort, a where, a limit), read against the answer's columns, orders and
// bounds its rows. One the contract does not accept, or one over a column the answer does not hold, shapes nothing.
//
// Lines said away from a call (a run's passes, the draft's own changes) are told once, with the header, in the next
// request's fixed slot (`slot`). Nothing here caps or cuts: every page holds every row its read kept.
import { parseAutomationStudioRecordProcessing } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { automationStudioFlowDraftStepIsAction, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowLessSummary, AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstResultCoverage } from "../result/index.ts";
import { automationStudioAnswerFirstResultPort, automationStudioAnswerFirstResultStepHolder, type AutomationStudioAnswerFirstResultEvent, type AutomationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultRead, type AutomationStudioAnswerFirstResultStepRef } from "../result/index.ts";
import { automationStudioAnswerFirstProcessedRows, automationStudioAnswerFirstReadSchema, type AutomationStudioAnswerFirstRowCall, type AutomationStudioAnswerFirstRowsStored, type AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import { automationStudioAnswerFirstResultIntermediate, automationStudioAnswerFirstResultReadOfBatch, automationStudioAnswerFirstResultReadOfCall, automationStudioAnswerFirstResultVersionOf } from "./read-of.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";

/** What the latest decision says its call is: a step the draft adds as it runs, or a rerun of a kept step. Absent: a look. */
export type AutomationStudioAnswerFirstResultIntent =
  | { kind: "add"; position: number; intermediate: boolean }
  | { kind: "rerun"; step: AutomationStudioFlowDraftStep };

type ReadPages = NonNullable<AutomationStudioFlowLessSummary["readPages"]>;
/** A run pass's answer, as the forward run reports it (`runtime/llm/node-tools/replay/forward.ts`). */
type PassAnswer = Pick<AutomationStudioLlmEvidenceToolExecutionResult, "evidence" | "effectApplied" | "resultCode">;

export type AutomationStudioAnswerFirstResultFeed = {
  readonly port: AutomationStudioAnswerFirstResultPort;
  /** What the decision just made says its call is (header). */
  expect(intent: AutomationStudioAnswerFirstResultIntent | undefined): void;
  /** One call through the chain, with what the sink stored of it (`undefined`: not a read). Answers the line its answer carries. */
  called(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult, stored: AutomationStudioAnswerFirstRowsStored | undefined): string | undefined;
  /** A run's pass of `step` answered, within the draft `steps`. */
  passed(step: AutomationStudioFlowDraftStep, steps: readonly AutomationStudioFlowDraftStep[], answer: PassAnswer): void;
  /** A saved Flow's run's batches, each with the draft step its node stands for, where one does. */
  batches(entries: readonly { batch: AutomationStudioRecordBatch; step: AutomationStudioFlowDraftStep | undefined }[]): void;
  /** Rows an earlier segment of this attempt found, carried on into this one. */
  carried(steps: readonly AutomationStudioFlowDraftStep[], rows: readonly JsonObject[], datasetId: string | undefined): void;
  /** The draft as it now stands. */
  draft(steps: readonly AutomationStudioFlowDraftStep[]): void;
  /** The fixed slot's words for the next request: the header, and what changed since the last request away from a call. */
  slot(): string;
  /** The answer, as the completion check, the attempt's row and the ending read it. */
  rows(): AutomationStudioAnswerFirstRowsSummary;
  /** The output step's pages, as the judge is told them. */
  readPages(): ReadPages;
  /** Every contributing page, its current conditions and coverage, the sure column contract and working evidence. */
  evidence(): AutomationStudioResultEvidenceBundle;
  /** The empty result's refusal, where a look holds rows the draft could take; `undefined` otherwise. */
  emptyRefusal(): string | undefined;
  /** The ledger id of a draft step. */
  idOf(step: AutomationStudioFlowDraftStep): string;
};

const EMPTY: AutomationStudioAnswerFirstRowsSummary = { totalRows: 0, truncated: false, columns: [], rows: [] };
const CARRIED_SOURCE = "carried";

export function automationStudioAnswerFirstResultFeed(input: { instructionText: string; readRowsKey: string | undefined }): AutomationStudioAnswerFirstResultFeed {
  const port = automationStudioAnswerFirstResultPort(input.instructionText);
  /** A draft step's chain (its own id, or the step it stands for) to its ledger id. */
  const ids = new Map<string, string>();
  /** Each page's source to the dataset the sink stored it under, and the sources whose read was cut by the schema's limit. */
  const datasets = new Map<string, string>();
  const truncated = new Set<string>();
  /** Each step's declared processing, by its ledger id, as its latest read or its draft input said it. */
  const processes = new Map<string, unknown>();
  const declare = (id: string, input: JsonObject): void => {
    const process = declaredProcess(input);
    if (process === undefined) processes.delete(id);
    else processes.set(id, process);
  };
  let intent: AutomationStudioAnswerFirstResultIntent | undefined;
  /** The latest pass's read, for the forward run's report of it (`passed`). */
  let pass: { read?: AutomationStudioAnswerFirstResultRead } | undefined;
  const said: string[] = [];
  const told = (line: string | undefined): void => { if (line) said.push(line); };

  const idOf = (step: AutomationStudioFlowDraftStep): string => {
    const chain = step.standsFor ?? step.id ?? `p${step.position}`;
    const id = ids.get(chain) ?? (step.id === undefined ? undefined : ids.get(step.id)) ?? step.callId ?? chain;
    ids.set(chain, id);
    if (step.id !== undefined) ids.set(step.id, id);
    return id;
  };
  const refOf = (step: AutomationStudioFlowDraftStep): AutomationStudioAnswerFirstResultStepRef => ({ id: idOf(step), position: step.position, intermediate: automationStudioAnswerFirstResultIntermediate(step.input) });
  const isLook = (source: string | undefined): boolean => source !== undefined && port.ledger().looks.some((look) => look.source === source);
  /** A kept step that reads a list: one the ledger met, one written with a read's columns, or a look the draft took. */
  const isReadStep = (step: AutomationStudioFlowDraftStep): boolean => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step)
    && (automationStudioAnswerFirstResultStepHolder(port.ledger(), idOf(step)) !== undefined || Object.keys(automationStudioAnswerFirstResultVersionOf(step.input).fields).length > 0 || isLook(step.callId));
  const stored = (source: string, datasetId: string | undefined, cut: boolean): void => {
    if (datasetId !== undefined) datasets.set(source, datasetId);
    if (cut) truncated.add(source);
  };

  const rows = (): AutomationStudioAnswerFirstRowsSummary => {
      const output = port.outputStep();
      if (!output) return EMPTY;
      const answer = port.answer();
      const sources = output.pages.map((page) => page.source);
      const datasetId = automationStudioAnswerFirstStoredDatasetId("step", output.id, output.version);
      if (!sources.length) return EMPTY;
      // A row repeated whole on two pages is one row, as the store's default processing counts it.
      const columns = answer.columns.length ? answer.columns : Object.keys(output.reads.fields);
      const shaped = processed(output.pages.flatMap((page) => page.kept), columns, processes.get(output.id));
      return { datasetId, totalRows: shaped.rows.length, truncated: sources.some((source) => truncated.has(source)), columns: shaped.columns, rows: shaped.rows };
  };
  const record = (events: readonly AutomationStudioAnswerFirstResultEvent[], before = rows().totalRows): string | undefined => port.record(events, { before, after: () => rows().totalRows });

  return {
    port,
    idOf,
    expect(next) {
      intent = next;
    },
    called(call, answer, storedRows) {
      const before = rows().totalRows;
      const read = storedRows && !storedRows.failure ? automationStudioAnswerFirstResultReadOfCall(call, answer, storedRows.rows, input.readRowsKey) : undefined;
      if (read) stored(call.callId, storedRows?.datasetId, storedRows?.truncated === true);
      if (typeof call.value.replay === "string") {
        if (call.value.replay !== "reset") pass = read ? { read } : {};
        return undefined;
      }
      if (!read) return undefined;
      const now = intent;
      intent = undefined;
      if (now?.kind === "add") declare(call.callId, call.value);
      if (now?.kind === "rerun") declare(idOf(now.step), call.value);
      if (now?.kind === "add") return record([{ kind: "page", step: { id: call.callId, position: now.position, intermediate: now.intermediate }, read }], before);
      if (now?.kind === "rerun") return record([{ kind: "page", step: refOf(now.step), read }], before);
      return record([{ kind: "look", read }], before);
    },
    passed(step, steps, answer) {
      const held = pass;
      pass = undefined;
      if (held?.read) {
        told(record([{ kind: "page", step: refOf(step), read: { ...held.read, version: automationStudioAnswerFirstResultVersionOf(step.input, held.read.version.listKey) } }]));
        return;
      }
      const loop = steps.find((each) => each.disposition === "kept" && each.routing?.kind === "repeat" && each.routing.while !== undefined && each.routing.while === step.id);
      if (!loop || !automationStudioAnswerFirstResultStepHolder(port.ledger(), idOf(loop))) return;
      const ended = endedWords(answer);
      if (ended !== undefined) told(record([{ kind: "paging", stepId: idOf(loop), paging: { verdict: "ended", reason: ended } }]));
      else if (answer.effectApplied) told(record([{ kind: "paging", stepId: idOf(loop), paging: { verdict: "moved" } }]));
    },
    batches(entries) {
      const before = rows().totalRows;
      const events: AutomationStudioAnswerFirstResultEvent[] = [];
      for (const { batch, step } of entries) {
        if (!step) continue;
        declare(idOf(step), step.input);
        stored(batch.batchKey, batch.datasetId, batch.truncated);
        events.push({ kind: "page", step: refOf(step), read: automationStudioAnswerFirstResultReadOfBatch(batch, step) });
      }
      if (events.length) told(record(events, before));
    },
    carried(steps, rows, datasetId) {
      const kept = steps.filter((step) => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step) && !automationStudioAnswerFirstResultIntermediate(step.input));
      const step = kept.filter((each) => each.reads !== undefined || Object.keys(automationStudioAnswerFirstResultVersionOf(each.input).fields).length > 0).at(-1) ?? kept.at(-1);
      if (!step || !rows.length) return;
      stored(CARRIED_SOURCE, datasetId, false);
      told(record([{ kind: "page", step: refOf(step), read: { source: CARRIED_SOURCE, version: automationStudioAnswerFirstResultVersionOf(step.input), kept: rows.map((row) => ({ ...row })), carried: true } }]));
    },
    draft(steps) {
      const before = rows().totalRows;
      const ledger = port.ledger();
      const reads = steps.filter(isReadStep);
      const live = new Set(reads.map(idOf));
      const events: AutomationStudioAnswerFirstResultEvent[] = ledger.steps.flatMap((step) => [step.id, ...step.folded.map((folded) => folded.id)]).filter((id) => !live.has(id)).map((stepId) => ({ kind: "dropped", stepId }));
      for (const step of reads) {
        const ref = refOf(step);
        declare(ref.id, step.input);
        if (step.callId !== undefined && !automationStudioAnswerFirstResultStepHolder(ledger, ref.id) && isLook(step.callId)) events.push({ kind: "take", source: step.callId, step: ref });
        events.push({ kind: "step", step: ref, version: automationStudioAnswerFirstResultVersionOf(step.input) });
      }
      if (events.length) told(record(events, before));
    },
    slot() {
      const lines = said.splice(0);
      return lines.length ? `${port.header(rows().totalRows)} Changed since your last decision: ${lines.join(" ")}` : port.header(rows().totalRows);
    },
    rows,
    readPages() {
      const output = port.outputStep();
      return (output?.pages ?? []).map((page) => ({
        ...(page.where === undefined ? {} : { where: page.where }),
        ...(page.place === undefined ? {} : { place: page.place }),
        kept: page.kept.length,
        ...(page.kept.length ? { rows: page.kept.map((row) => ({ ...row })) } : {}),
        ...(page.leftOut ? { leftOut: page.leftOut } : {}),
      }));
    },
    emptyRefusal() {
      return port.ledger().looks.some((look) => look.kept.length > 0) ? port.emptyRefusal() : undefined;
    },
    evidence() {
      const ledger = port.ledger();
      const output = port.outputStep();
      const page = (read: AutomationStudioAnswerFirstResultRead, step: string, version: number, position?: number): AutomationStudioResultEvidencePage => ({ source: read.source, step, version, ...(position === undefined ? {} : { position }), conditions: read.version.conditions, fields: read.version.fields, ...(read.version.listKey === undefined ? {} : { listKey: read.version.listKey }), ...(read.where === undefined ? {} : { where: read.where }), ...(read.place === undefined ? {} : { place: read.place }), kept: read.kept.length, rows: read.kept, ...(read.leftOut === undefined ? {} : { leftOut: read.leftOut }), ...(read.carried ? { carried: true } : {}) });
      const coverage = output ? automationStudioAnswerFirstResultCoverage(output) : undefined;
      return {
        pages: output?.pages.map((read) => page({ ...read, version: output.reads }, output.id, output.version, output.position)) ?? [],
        coverage: output && coverage ? [{ step: output.id, version: output.version, places: coverage.places, first: coverage.first, ...(coverage.last ? { last: { place: coverage.last.place, ...(coverage.last.paging ? { paging: coverage.last.paging } : {}) } } : {}) }] : [],
        ...(ledger.contract.sure && ledger.contract.columns.length ? { answerContract: { columns: ledger.contract.columns } } : {}),
        working: ledger.steps.filter((step) => step !== output).map((step) => ({ step: step.id, position: step.position, ...(step.reads.listKey === undefined ? {} : { listKey: step.reads.listKey }), kept: step.pages.reduce((sum, read) => sum + read.kept.length, 0) })),
        looks: ledger.looks.map((read) => page(read, "look", 1))
      };
    },
  };
}

/** What a pass that moves a list on said when there was nothing more: the domain answers `route: "ended"` with its words. */
function endedWords(answer: PassAnswer): string | undefined {
  const evidence = answer.evidence;
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence) || evidence.route !== "ended") return undefined;
  return typeof evidence.said === "string" && evidence.said.trim() ? evidence.said.trim() : "the step that moves the list on answered ended";
}

/** The `process` a read's record output declares, as written (`recordOutput.process` on its parameters or itself). */
function declaredProcess(input: JsonObject): unknown {
  const parameters = isObject(input.parameters) ? input.parameters : undefined;
  const output = isObject(parameters?.recordOutput) ? parameters.recordOutput : isObject(input.recordOutput) ? input.recordOutput : undefined;
  return output?.process;
}

/** The answer's rows as the declared processing shapes them (header), or as they are. */
function processed(rows: readonly JsonObject[], columns: readonly string[], declared: unknown): { rows: JsonObject[]; columns: { id: string; label: string }[] } {
  const schema = automationStudioAnswerFirstReadSchema(rows);
  const parsed = schema ? parseAutomationStudioRecordProcessing(declared, schema) : undefined;
  const shaped = declared !== undefined && schema && parsed?.ok
    ? automationStudioAnswerFirstProcessedRows(rows, schema, parsed.processing).rows : wholeOnce(rows);
  // Dedupe compares the original whole rows before narrowing the answer. Two listings differing in an unasked
  // column remain two listings; a declared dedupe (including false) and sort run against those full rows too.
  return { rows: shaped.map((row) => Object.fromEntries(columns.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]!]))), columns: columns.map((id) => ({ id, label: id })) };
}

/** Rows without a row repeated whole, the first of each where it was. */
function wholeOnce(rows: readonly JsonObject[]): JsonObject[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = stableJson(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
