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
// **Steps appending to one named output are one answer** (`../result/output-group.ts`): the output step's pages after
// theirs, as a run of the saved Flow fills that output. Each keeps its own pages, version and coverage.
//
// **A row repeated whole is one row** in the answer (a feed that pins one row to every page), as the store's default
// processing dedupes a run's rows: never a cut, only the same row once.
//
// **A read's declared processing shapes the answer** as a saved run's record output would (t869, run-mw37vz9n): the
// output step's own `recordOutput.process` (a sort, a where, a limit), read against the answer's columns, orders and
// bounds its rows. One the contract does not accept, or one over a column the answer does not hold, shapes nothing.
//
// **And the result's own processing over it (t970).** What `core.set_result_processing` set
// (`../attempt/result-processing.ts`) is merged over the output step's declaration, key by key, and shapes
// the answer the same way, with the pages' whole rows as it reads them: a mark read only to filter by is
// tested there and is no column of the answer. What it did -- the counts, and per filter the rows it alone
// left out -- goes to the judge in `evidence().processing`, so the judge checks the filtering rather than
// trusting it; `collected` is the rows it works on, before it, which the tool answers with.
//
// Lines said away from a call (a run's passes, the draft's own changes) are told once, with the header, in the next
// request's fixed slot (`slot`). Nothing here caps or cuts: every page holds every row its read kept.
import { parseAutomationStudioRecordProcessing, type AutomationStudioRecordProcessing, type AutomationStudioRecordProcessingAccount, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsAction, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowLessSummary, AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage, AutomationStudioResultEvidenceProcessing } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstResultCoverage } from "../result/index.ts";
import { automationStudioAnswerFirstResultPort, automationStudioAnswerFirstResultStepHolder, type AutomationStudioAnswerFirstResultEvent, type AutomationStudioAnswerFirstResultPort, type AutomationStudioAnswerFirstResultRead, type AutomationStudioAnswerFirstResultStepRef } from "../result/index.ts";
import { automationStudioAnswerFirstProcessedRows, automationStudioAnswerFirstReadSchema, type AutomationStudioAnswerFirstRowCall, type AutomationStudioAnswerFirstRowsStored, type AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import { automationStudioAnswerFirstResultIntermediate, automationStudioAnswerFirstResultReadOfBatch, automationStudioAnswerFirstResultReadOfCall, automationStudioAnswerFirstResultVersionOf } from "./read-of.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";
import { automationStudioAnswerFirstResultWritesOf } from "./writes-of.ts";
import type { AutomationStudioAnswerFirstProcessingDeclaration } from "../result-processing/index.ts";
import { automationStudioAnswerFirstDataStage } from "./stage.ts";
import { automationStudioAnswerFirstResultSchema } from "./schema.ts";
import type { AutomationStudioAnswerFirstResultReadiness } from "./readiness.ts";
import { automationStudioAnswerFirstResultSourceState } from "./source-state.ts";
import { automationStudioFlowBootstrapInstructionAsk } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";

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
  /** Restore only the original contributing evidence pages and their copied retained schemas. */
  restored(entries: readonly { step: AutomationStudioFlowDraftStep; read: AutomationStudioAnswerFirstResultRead; version: number; schema: AutomationStudioRecordSchema; datasetId?: string; leftOut?: AutomationStudioResultEvidencePage["leftOut"] }[]): void;
  sourceUnavailable(reason: string, originalEvidence?: AutomationStudioResultEvidenceBundle | undefined): void;
  /** Internal forward-walk receipt: a complete fresh collection may supersede unavailable originals. */
  collectionReplaced(receipt: { from: number; to: number; callIds: readonly string[]; readSince: number; steps: readonly AutomationStudioFlowDraftStep[] }): JsonObject | undefined;
  /** The draft as it now stands. */
  draft(steps: readonly AutomationStudioFlowDraftStep[]): void;
  /** The fixed slot's words for the next request: the header, and what changed since the last request away from a call. */
  slot(): string;
  /** The answer, as the completion check, the attempt's row and the ending read it. */
  rows(): AutomationStudioAnswerFirstRowsSummary;
  /** The result's pages (the output step's, after those of the steps appending to its output), as the judge is told them. */
  readPages(): ReadPages;
  /** Every contributing page, its current conditions and coverage, the sure column contract and working evidence. */
  evidence(): AutomationStudioResultEvidenceBundle;
  /** The empty result's refusal, where a look holds rows the draft could take; `undefined` otherwise. */
  emptyRefusal(): string | undefined;
  /** The ledger id of a draft step. */
  idOf(step: AutomationStudioFlowDraftStep): string;
  /** The result processing `core.set_result_processing` holds (header); `undefined` clears it. */
  setProcessing(declared: AutomationStudioRecordProcessing | undefined): void;
  /** The rows the answer is made from, before any processing, with their schema: what the result processing reads (header). */
  collected(): { datasetId: string; schema: AutomationStudioRecordSchema; rows: JsonObject[] } | undefined;
  readiness(): AutomationStudioAnswerFirstResultReadiness;
  processingDeclaration(): AutomationStudioAnswerFirstProcessingDeclaration | undefined;
  boundProcessing(): AutomationStudioRecordProcessing | undefined;
  /** Canonical saved configuration, retaining only explicit input value bindings. */
  storedProcessing(): JsonObject | undefined;
  amendProcessing(process: JsonValue, why: string | undefined): { ok: true; changed: boolean } | { ok: false; reason: string };
};

const EMPTY: AutomationStudioAnswerFirstRowsSummary = { totalRows: 0, truncated: false, columns: [], rows: [] };
const CARRIED_SOURCE = "carried";
const PUBLICATION_TRACKING_MISSING = "The attempt's pending-publication metadata is unavailable. Restore the exact private record before publishing an answer; a later read cannot prove which earlier answer publications need retirement. The original source records and processing reference are preserved.";

export function automationStudioAnswerFirstResultFeed(input: { instructionText: string; readRowsKey: string | undefined; processing?: AutomationStudioAnswerFirstProcessingDeclaration | undefined; processingReferenceTimeMs?: number | null | undefined; requiresDataOutput?: true | undefined; inputs?: Readonly<Record<string, JsonValue>> | undefined; publicationTrackingComplete?: boolean | undefined }): AutomationStudioAnswerFirstResultFeed {
  const port = automationStudioAnswerFirstResultPort(input.instructionText);
  const stage = automationStudioAnswerFirstDataStage(input.processing, input.processingReferenceTimeMs, input.requiresDataOutput === true || automationStudioFlowBootstrapInstructionAsk(input.instructionText).records, input.inputs);
  const reference = input.processingReferenceTimeMs ?? Date.now();
  let legacyRefusal: string | undefined;
  const sourceState = automationStudioAnswerFirstResultSourceState();
  const carriedLeftOut = new Map<string, AutomationStudioResultEvidencePage["leftOut"]>();
  const carriedVersions = new Map<string, number>();
  /** A draft step's chain (its own id, or the step it stands for) to its ledger id. */
  const ids = new Map<string, string>();
  /** Each page's source to the dataset the sink stored it under, and the sources whose read was cut by the schema's limit. */
  const datasets = new Map<string, string>();
  const schemas = new Map<string, AutomationStudioRecordSchema>();
  const truncated = new Set<string>();
  /** Each step's declared processing, by its ledger id, as its latest read or its draft input said it. */
  const processes = new Map<string, unknown>();
  const declare = (id: string, input: JsonObject): void => {
    const process = declaredProcess(input);
    if (process === undefined) processes.delete(id);
    else processes.set(id, process);
  };
  /** The result processing the tool holds, merged over the output step's own (header). */
  let held: AutomationStudioRecordProcessing | undefined;
  /** What the latest processing of the answer did, for the judge (header); absent where nothing was declared. */
  let account: { declared: AutomationStudioRecordProcessing; account: AutomationStudioRecordProcessingAccount } | undefined;
  let intent: AutomationStudioAnswerFirstResultIntent | undefined;
  /** The latest pass's read, for the forward run's report of it (`passed`). */
  let pass: { read?: AutomationStudioAnswerFirstResultRead } | undefined;
  const said: string[] = [];
  const told = (line: string | undefined): void => { if (line) said.push(line); };

  const idOf = (step: AutomationStudioFlowDraftStep): string => {
    const chain = step.standsFor ?? step.id ?? `p${step.position}`;
    // The step's own id first: a step the ledger already met keeps its ledger id when it later comes to stand for
    // another. That is a hand fix put in a broken saved step's place at the ending (`../flow-run/stand-in.ts`), whose
    // pages are its own call's; through the chain it would take the broken step's id, and its pages would drop out of
    // the result. A rerun is a new step the ledger has not met, so it still takes the id of the step it reran.
    const id = (step.id === undefined ? undefined : ids.get(step.id)) ?? ids.get(chain) ?? step.callId ?? chain;
    ids.set(chain, id);
    if (step.id !== undefined) ids.set(step.id, id);
    return id;
  };
  const refOf = (step: AutomationStudioFlowDraftStep): AutomationStudioAnswerFirstResultStepRef => withWrites({ id: idOf(step), position: step.position, intermediate: automationStudioAnswerFirstResultIntermediate(step.input) }, step.input);
  const isLook = (source: string | undefined): boolean => source !== undefined && port.ledger().looks.some((look) => look.source === source);
  /** A kept step that reads a list: one the ledger met, one written with a read's columns, or a look the draft took. */
  const isReadStep = (step: AutomationStudioFlowDraftStep): boolean => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step)
    && (automationStudioAnswerFirstResultStepHolder(port.ledger(), idOf(step)) !== undefined || Object.keys(automationStudioAnswerFirstResultVersionOf(step.input).fields).length > 0 || automationStudioAnswerFirstResultWritesOf(step.input) !== undefined || isLook(step.callId));
  const stored = (source: string, datasetId: string | undefined, cut: boolean, schema?: AutomationStudioRecordSchema): void => {
    carriedLeftOut.delete(source);
    carriedVersions.delete(source);
    if (datasetId !== undefined) datasets.set(source, datasetId);
    if (cut) truncated.add(source);
    if (schema !== undefined) schemas.set(source, structuredClone(schema));
  };
  const retainedSchema = () => automationStudioAnswerFirstResultSchema(port.outputGroup().flatMap((step) => step.pages).map((page) => ({ source: page.source, schema: schemas.get(page.source) })));
  const refreshed = (step: string, read: AutomationStudioAnswerFirstResultRead): void => {
    if (!schemas.has(read.source)) return;
    const holder = automationStudioAnswerFirstResultStepHolder(port.ledger(), step)?.id ?? step;
    const version = sourceState.replace(holder, read, datasets.get(read.source));
    if (version !== undefined) carriedVersions.set(read.source, version);
  };

  const rows = (): AutomationStudioAnswerFirstRowsSummary => {
      account = undefined;
      legacyRefusal = undefined;
      if (input.publicationTrackingComplete === false) return EMPTY;
      if (sourceState.reason() !== undefined && stage.active()) return EMPTY;
      // The output step, after the steps appending to its output before it (`../result/output-group.ts`).
      const group = port.outputGroup();
      const output = group.at(-1);
      if (!output) {
        stage.evaluate({ rows: [], columns: [] });
        return EMPTY;
      }
      const answer = port.answer();
      const pages = group.flatMap((step) => step.pages);
      const sources = pages.map((page) => page.source);
      const datasetId = automationStudioAnswerFirstStoredDatasetId("step", output.id, output.version);
      if (!sources.length) {
        stage.evaluate({ rows: [], columns: [] });
        return EMPTY;
      }
      // A row repeated whole on two pages is one row, as the store's default processing counts it.
      const columns = answer.columns.length ? answer.columns : [...new Set(group.flatMap((step) => Object.keys(step.reads.fields)))];
      const schema = retainedSchema();
      if (stage.active()) {
        sourceState.validate(baseEvidence(false), datasets);
        if (sourceState.reason() !== undefined) return EMPTY;
        const evaluated = stage.evaluate({ ...(schema.ok ? { schema: schema.schema } : { schemaIssues: schema.issues }), rows: group.flatMap((step) => step.pages.flatMap((page) => page.kept.map((values) => ({ values, nodeId: step.id, batchKey: page.source })))), columns, askedColumns: port.ledger().contract.sure ? port.ledger().contract.columns : undefined });
        if (evaluated.processing && evaluated.account) account = { declared: evaluated.processing, account: evaluated.account };
        return evaluated.summary ? { datasetId, totalRows: evaluated.summary.rows.length, truncated: sources.some((source) => truncated.has(source)), ...evaluated.summary } : EMPTY;
      }
      const shaped = processed(pages.flatMap((page) => page.kept), columns, merged(processes.get(output.id), held), schema.ok ? schema.schema : undefined, reference);
      account = shaped.account;
      legacyRefusal = shaped.refusal;
      return { datasetId, totalRows: shaped.rows.length, truncated: sources.some((source) => truncated.has(source)), columns: shaped.columns, rows: shaped.rows };
  };
  const record = (events: readonly AutomationStudioAnswerFirstResultEvent[], before = rows().totalRows): string | undefined => port.record(events, { before, after: () => rows().totalRows });
  /** What the answer's processing did, as the judge is shown it (header); nothing where none was declared. */
  const processingEvidence = (): { processing?: AutomationStudioResultEvidenceProcessing } => {
    rows();
    return account ? { processing: automationStudioAnswerFirstProcessingEvidence(account.declared, account.account) } : {};
  };

  const baseEvidence = (processed = true): AutomationStudioResultEvidenceBundle => {
    const ledger = port.ledger();
    // Every step whose pages are the answer, each page and coverage under its own step and version.
    const group = port.outputGroup();
    const page = (read: AutomationStudioAnswerFirstResultRead, step: string, version: number, position?: number): AutomationStudioResultEvidencePage => {
      const leftOut = carriedLeftOut.get(read.source) ?? read.leftOut;
      return { source: read.source, ...(datasets.has(read.source) ? { datasetId: datasets.get(read.source)! } : {}), step, version: carriedVersions.get(read.source) ?? version, ...(position === undefined ? {} : { position }), conditions: read.version.conditions, fields: read.version.fields, ...(read.version.listKey === undefined ? {} : { listKey: read.version.listKey }), ...(read.where === undefined ? {} : { where: read.where }), ...(read.place === undefined ? {} : { place: read.place }), kept: read.kept.length, rows: read.kept, ...(read.invalidCount === undefined ? {} : { invalidCount: read.invalidCount }), ...(leftOut === undefined ? {} : { leftOut }), ...(read.carried ? { carried: true } : {}) };
    };
    return {
      pages: group.flatMap((output) => output.pages.map((read) => page({ ...read, version: output.reads }, output.id, output.version, output.position))),
      coverage: group.map((output) => {
        const coverage = automationStudioAnswerFirstResultCoverage(output);
        return { step: output.id, version: output.version, places: coverage.places, first: coverage.first, ...(coverage.last ? { last: { place: coverage.last.place, ...(coverage.last.paging ? { paging: coverage.last.paging } : {}) } } : {}) };
      }),
      ...(ledger.contract.sure && ledger.contract.columns.length ? { answerContract: { columns: ledger.contract.columns } } : {}),
      working: ledger.steps.filter((step) => !group.includes(step)).map((step) => ({ step: step.id, position: step.position, ...(step.reads.listKey === undefined ? {} : { listKey: step.reads.listKey }), kept: step.pages.reduce((sum, read) => sum + read.kept.length, 0) })),
      looks: ledger.looks.map((read) => page(read, "look", 1)),
      ...(processed ? processingEvidence() : {})
    };
  };

  return {
    port,
    idOf,
    processingDeclaration: stage.declaration,
    sourceUnavailable(reason, originalEvidence) {
      const current = baseEvidence();
      sourceState.hold(reason, originalEvidence ?? current, current, originalEvidence !== undefined, datasets);
    },
    collectionReplaced(receipt) {
      if (!stage.active() || sourceState.reason() === undefined) return undefined;
      const refuse = (said: string): JsonObject => ({ replaced: false, code: "answer_first.collection_replacement_incomplete", said });
      const group = port.outputGroup();
      const pages = group.flatMap((step) => step.pages);
      const invoked = new Set(receipt.callIds);
      if (!Number.isSafeInteger(receipt.readSince) || receipt.readSince < 0 || !pages.length || pages.some((page) => page.seq < receipt.readSince || !invoked.has(page.source) || page.carried || page.invalidCount !== 0 || !schemas.has(page.source))) return refuse("A replacement needs actual fresh read occurrences from this one forward invocation, each with its full retained schema and known zero rejected originals. Older pages, even with reused call ids, cannot supply it.");
      if (!retainedSchema().ok) return refuse("The fresh collection's complete retained schemas are unavailable or disagree.");
      const members = receipt.steps.filter((step) => step.disposition === "kept" && group.some((held) => automationStudioAnswerFirstResultStepHolder(port.ledger(), idOf(step))?.id === held.id));
      if (group.some((held) => !members.some((step) => automationStudioAnswerFirstResultStepHolder(port.ledger(), idOf(step))?.id === held.id))) return refuse("A contributing read is not identified in this actual kept forward draft.");
      const positions = members.map((step) => step.position);
      for (const step of members) {
        if (step.routing?.kind !== "repeat") continue;
        const through = step.routing.through;
        const end = receipt.steps.find((item) => automationStudioFlowDraftStepId(item) === through);
        if (!end) return refuse("The collection's declared paging boundary is unavailable.");
        positions.push(end.position);
      }
      if (!positions.length || positions.some((position) => position < receipt.from || position > receipt.to)) return refuse("The successful forward range must include the contributing reads and their declared paging boundaries.");
      const current = baseEvidence(false);
      if (current.coverage.length !== group.length || current.coverage.some((coverage) => coverage.first !== "read" || coverage.last?.paging?.verdict !== "ended")) return refuse("A finished walk is not a complete collection. Re-read from the actual first site page and observe pagination ending for each contributing group. An opaque/unplaced start remains unknown; a data limit with global ordering does not prove collection completeness.");
      if (!sourceState.supersede(current)) return refuse("The complete fresh collection does not match the known original source/list identity. Do not substitute an unrelated collection.");
      told("A complete fresh collection superseded unavailable original evidence; it was collected now, not restored.");
      return { replaced: true, kind: "fresh_collection", sources: pages.map((page) => page.source), readSince: receipt.readSince };
    },
    boundProcessing() {
      rows();
      return input.publicationTrackingComplete !== false && sourceState.reason() === undefined ? stage.processing() : undefined;
    },
    storedProcessing() {
      rows();
      return input.publicationTrackingComplete !== false && sourceState.reason() === undefined ? stage.storedProcessing() : undefined;
    },
    readiness() {
      rows();
      const missing = sourceState.reason();
      return input.publicationTrackingComplete === false ? { state: "missing-evidence", code: "answer_first.publication_tracking_missing", reason: PUBLICATION_TRACKING_MISSING } : missing !== undefined && stage.active() ? { state: "missing-evidence", code: "answer_first.processing_source_missing", reason: missing } : legacyRefusal === undefined ? stage.readiness() : { state: "missing-evidence", code: "answer_first.processing_invalid", reason: legacyRefusal };
    },
    amendProcessing(process, why) {
      const schema = retainedSchema();
      return stage.amend(process, why, schema.ok ? schema.schema : undefined);
    },
    setProcessing(declared) {
      held = declared;
    },
    collected() {
      const group = port.outputGroup();
      const output = group.at(-1);
      const rows = group.flatMap((step) => step.pages).flatMap((page) => page.kept.map((row) => ({ ...row })));
      const actual = retainedSchema();
      const schema = actual.ok ? actual.schema : stage.active() ? undefined : rows.length ? automationStudioAnswerFirstReadSchema(rows) : undefined;
      return output && schema ? { datasetId: automationStudioAnswerFirstStoredDatasetId("step", output.id, output.version), schema, rows } : undefined;
    },
    expect(next) {
      intent = next;
    },
    called(call, answer, storedRows) {
      const before = rows().totalRows;
      const read = storedRows && !storedRows.failure ? automationStudioAnswerFirstResultReadOfCall(call, answer, storedRows.rows, input.readRowsKey, undefined, storedRows.invalidCount) : undefined;
      if (read) stored(call.callId, storedRows?.datasetId, storedRows?.truncated === true, storedRows?.schema);
      if (typeof call.value.replay === "string") {
        if (call.value.replay !== "reset") pass = read ? { read } : {};
        return undefined;
      }
      if (!read) return undefined;
      const now = intent;
      intent = undefined;
      if (now?.kind === "rerun") refreshed(idOf(now.step), read);
      if (now?.kind === "add") declare(call.callId, call.value);
      if (now?.kind === "rerun") declare(idOf(now.step), call.value);
      if (now?.kind === "add") return record([{ kind: "page", step: withWrites({ id: call.callId, position: now.position, intermediate: now.intermediate }, call.value), read }], before);
      if (now?.kind === "rerun") return record([{ kind: "page", step: refOf(now.step), read }], before);
      return record([{ kind: "look", read }], before);
    },
    passed(step, steps, answer) {
      const held = pass;
      pass = undefined;
      if (held?.read) {
        const read = { ...held.read, version: automationStudioAnswerFirstResultVersionOf(step.input, held.read.version.listKey) };
        refreshed(idOf(step), read);
        told(record([{ kind: "page", step: refOf(step), read }]));
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
        stored(batch.batchKey, batch.datasetId, batch.truncated, batch.schema);
        const read = automationStudioAnswerFirstResultReadOfBatch(batch, step);
        refreshed(idOf(step), read);
        events.push({ kind: "page", step: refOf(step), read });
      }
      if (events.length) told(record(events, before));
    },
    carried(steps, rows, datasetId) {
      if (stage.active()) return; // Projected legacy previews are not original automatic evidence.
      const kept = steps.filter((step) => step.disposition === "kept" && step.effect === "observe" && automationStudioFlowDraftStepIsAction(step) && !automationStudioAnswerFirstResultIntermediate(step.input));
      const step = kept.filter((each) => each.reads !== undefined || Object.keys(automationStudioAnswerFirstResultVersionOf(each.input).fields).length > 0).at(-1) ?? kept.at(-1);
      if (!step || !rows.length) return;
      stored(CARRIED_SOURCE, datasetId, false);
      told(record([{ kind: "page", step: refOf(step), read: { source: CARRIED_SOURCE, version: automationStudioAnswerFirstResultVersionOf(step.input), kept: rows.map((row) => ({ ...row })), carried: true } }]));
    },
    restored(entries) {
      const events: AutomationStudioAnswerFirstResultEvent[] = [];
      for (const entry of entries) {
        stored(entry.read.source, entry.datasetId, false, entry.schema);
        if (entry.leftOut !== undefined) carriedLeftOut.set(entry.read.source, entry.leftOut);
        carriedVersions.set(entry.read.source, entry.version);
        declare(idOf(entry.step), entry.step.input);
        events.push({ kind: "page", step: refOf(entry.step), read: { ...entry.read, kept: entry.read.kept.map((row) => ({ ...row })), carried: true } });
      }
      if (events.length) told(record(events));
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
      const header = port.header(rows().totalRows);
      const sourceMissing = sourceState.reason();
      const readiness = input.publicationTrackingComplete === false ? { state: "missing-evidence", reason: PUBLICATION_TRACKING_MISSING } : sourceMissing ? { state: "missing-evidence", reason: sourceMissing } : legacyRefusal ? { state: "missing-evidence", reason: legacyRefusal } : stage.readiness();
      const missing = readiness.state === "missing-evidence" ? ` Data processing needs evidence: ${readiness.reason}` : "";
      return `${header}${lines.length ? ` Changed since your last decision: ${lines.join(" ")}` : ""}${missing}`;
    },
    rows,
    readPages() {
      return port.outputGroup().flatMap((step) => step.pages).map((page) => ({
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
    evidence() { return sourceState.evidence(baseEvidence()); },
  };
}

/** `ref` with the named output `input` writes, where it names one (`./writes-of.ts`). */
function withWrites(ref: AutomationStudioAnswerFirstResultStepRef, input: JsonObject): AutomationStudioAnswerFirstResultStepRef {
  const writes = automationStudioAnswerFirstResultWritesOf(input);
  return writes ? { ...ref, writes } : ref;
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

/** The output step's declaration with the result processing's keys over it (header); `undefined` where neither says anything. */
function merged(own: unknown, held: AutomationStudioRecordProcessing | undefined): unknown {
  if (held === undefined) return own;
  return isObject(own) ? { ...own, ...(held as unknown as JsonObject) } : held;
}

/**
 * The answer's rows as the declared processing shapes them (header), or as they are, and what the processing did. A
 * declaration naming its `columns` shows those, in its order, where they are the answer's; else the answer's columns.
 */
function processed(rows: readonly JsonObject[], columns: readonly string[], declared: unknown, retainedSchema: AutomationStudioRecordSchema | undefined, now: number): { rows: JsonObject[]; columns: { id: string; label: string }[]; account?: { declared: AutomationStudioRecordProcessing; account: AutomationStudioRecordProcessingAccount }; refusal?: string } {
  const schema = retainedSchema ?? automationStudioAnswerFirstReadSchema(rows);
  const parsed = schema ? parseAutomationStudioRecordProcessing(declared, schema) : undefined;
  if (declared !== undefined && (!schema || !parsed?.ok)) return { rows: [], columns: [], refusal: `The saved data processing cannot be applied to the retained schema: ${parsed && !parsed.ok ? parsed.issues.join(", ") : "captured schema missing"}. Repair the field binding or capture the missing evidence; no unfiltered answer has been substituted.` };
  const made = declared !== undefined && schema && parsed?.ok ? automationStudioAnswerFirstProcessedRows(rows, schema, parsed.processing, now) : undefined;
  const shaped = made ? made.rows : wholeOnce(rows);
  const asked = made && parsed?.ok && parsed.processing.columns ? parsed.processing.columns : undefined;
  const shown = asked ?? columns;
  // Dedupe compares the original whole rows before narrowing the answer. Two listings differing in an unasked
  // column remain two listings; a declared dedupe (including false) and sort run against those full rows too.
  return {
    rows: shaped.map((row) => Object.fromEntries(shown.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]!]))),
    columns: shown.map((id) => ({ id, label: id })),
    ...(made && parsed?.ok ? { account: { declared: parsed.processing, account: made.account } } : {})
  };
}

/** The account as the judge is shown it (`AutomationStudioResultEvidenceProcessing`): the counts, and per filter its words and the rows it alone left out, by label. */
function automationStudioAnswerFirstProcessingEvidence(declared: AutomationStudioRecordProcessing, account: AutomationStudioRecordProcessingAccount): AutomationStudioResultEvidenceProcessing {
  const filters = [...(account.conditions ?? []), ...(account.filters ?? [])].map((filter) => ({ condition: filter.condition, leftOut: filter.rejected, leftOutOnlyByThis: filter.leftOutOnlyByThis.map((row) => row.label) }));
  return { declared: JSON.parse(JSON.stringify(declared)) as JsonObject, collected: account.collected, leftOut: account.filteredOut, repeats: account.duplicates, cut: account.cut, kept: account.kept, filters };
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
