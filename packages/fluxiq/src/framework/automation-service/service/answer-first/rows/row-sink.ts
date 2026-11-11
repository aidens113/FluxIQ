// The row sink of an answer-first exploration: every real read's rows go into
// the run's dataset, so the result comes from rows a read returned and never
// from a model's words (answer-first plan D9; discovery "Missing for a
// finisher" item 2).
//
// **What it stores.** Only what a tool call's *answer* holds as a read's rows
// (`./found-rows.ts`). A call's input, a `complete` decision and any field a
// model wrote are never looked at, so none of them can become a row. The
// batch is a real `AutomationStudioRecordBatch`, as a Flow's record output
// would capture it: a schema derived from the read, rows allowlist-copied by
// `validateAutomationStudioRecords` (so a read's minted `$`, handle and
// evidence fields are dropped), `invalidCount` and `truncated` as that
// validation counts them, a `datasetId` the same for every page of the same
// read, and a `batchKey` unique to the call.
//
// **A store that fails does not fail the call.** The failure comes back as
// data (a code and an error name, never the error's words, which may quote a
// value), nothing of that batch joins the sink's account, and the exploration
// goes on; the same rows are stored the next time the model reads them.
//
// **Repeats.** The store keeps every batch; processing at the run's end drops
// a row repeated whole (the default dedupe). `summary` counts the same way,
// and `readBack` has the reader process the datasets first.
//
// **The latest read of a list is what it says (`./list-after-read.ts`).** A read
// either carries the list on or starts it over, and the store is made to hold
// exactly what this account holds: a batch that only adds rows is appended, and
// anything else (a sort, a filter, a row changed in place) is written as a
// `replace` of the list's whole rows, so the store's order is this account's. A
// read with no rows, or none the schema took, changes nothing, so an empty or
// refused read never wipes a good one. A list that got shorter says so
// (`fewerThanEarlier`).
//
// **A read the model marked a working one (`purpose: intermediate`)** never joins a
// run's rows and is the result only while nothing else is, as the record output's
// own contract says of it: it never saves or clears an answer.
//
// **A saved Flow's run and a later read of the same list are one result.** A run's batches
// (`recordBatch`) go under the dataset its record output names, and a read made afterwards has
// an id of its own, which alone would drop the run's rows from the result. So a read joins the
// latest dataset a run wrote that it can be stored in whole: its columns include every field of
// that dataset, and every row of it fits that schema, which also takes off what the read minted.
// It is stored under that dataset, with its schema and processing (the store refuses either
// changing within a run), and it then carries that list on or starts it over like any read. Two
// things say it is another list even so: the model named it otherwise, or it read another view of
// the site than the list's last read and shares no row. With neither, it can still take in another
// list with the same columns (a run's own batches say no address of the view, only of the page they read, where the answer did): a list wrongly joined is rows a
// judge can read and refuse, and a row wrongly dropped is a result lost. A read that does not join
// is something else, and `./result-dataset.ts` says when it may become the result.
//
// **A saved step's replay is the read it replays (run-mwb9b59w-aa0784db).** A forward run, a dry run or a part run
// sends a step again as its saved Flow will: the call its step keeps, with the record output assembly derives for
// it, under the person's named columns. The read the model made had none of that, so by name and columns the replay
// was another list, and a forward run's re-read of the result's own list replaced it as "a list of its own"
// (`answer_first.result_list_replaced`). So each read the model made is keyed by the step it is
// (`automationStudioAnswerFirstRecordedReadKey`, `./dataset-of-read.ts`), and a replay of that step goes into that read's
// list, ahead of any other rule, as the same read again: it carries the list on or starts it over like any read.
// Only where it meets the list's conditions and its rows fit the list's schema; a replay that returns fewer of its
// columns (the named ones) is still that list, its rows tied by the columns they share (`./row-ties.ts`). A replay of
// a step no read of this exploration made (a seeded Flow's) is as before.
//
// **A further page of a list that kept no row is still a page read (run-mwaf6gnt-638d90a0).** A list
// read in pages whose later page held nothing its conditions keep answers no rows, and stored nothing,
// so `readPages` named page 1 alone: two judges in a row answered unknown, "only page 1 was read, page 2
// may still hold qualifying rows" (steps 0039, 0049), and the model read page 2 again to prove it. So a
// read with no rows that is the same read of the same list -- its identity, given the list's columns,
// names that list's dataset (`./dataset-of-read.ts`) -- at a place the list has not read is kept as an
// empty page of it, and is told with `kept: 0`. It adds no row and moves no result; only a read with
// rows, or a run's batch, ever changes what the list holds (`./list-after-read.ts` passes empty pages by).
//
// **A read that changed the result in a way its own rows do not show says so (run-mwafor01-bb471f52).**
// When a read makes the result another list than the one that held rows, or starts the result's list
// over and leaves out rows it held, `fromCall` returns `resultChanged`: the result now and just before.
// The chain puts it on the read's answer for the model (`./result-change.ts`). Which list a read joins is
// not changed by it. A working read's list going is no change to tell: it was never the answer.
//
// **Each read page keeps the rows it kept and what its conditions left out (run-mwaknxf9-7549d126).**
// `readPages` tells the judge, per read, its rows and, where its answer said, the rows its own conditions
// turned down under the conditions that did it (`./read-evidence.ts`): on a site that lists one product
// as an ad and again as not, that is what says which card a stored row is. The note the model is shown
// of a changed result still says only place and count (`./result-change.ts`).
//
// **A weaker re-read of the result's own list never replaces it (run-mwaudvnh-c208d32c).** After a wrong judge's no, reads with no
// condition (0219, 0250) each became the whole result: 16 right rows became 15, then 27 unfiltered. A list holds the conditions all its rows
// met (`./read-evidence.ts`); a read of the result's list whose list then lacks one of the result's is set aside, stored and told so
// (`held_apart`), and never joins a list whose conditions it lacks. With all, more included, it is as before; only `writeMode: replace` gets
// past. A run is never set aside. **Only the same list (run-mwb4bf67-3c240399):** a read of another list has no reason to share the result's
// conditions, and a task's last read is often another page entirely (the saved items, with a status column, after a filtered search), so it
// replaces the result as before (`other_list`). Same is the model's own word first, its record output naming the result's list; else the
// view of the site, where the read and the result's reads both say one; else, a view unsaid, the read returns every column of the result.
//
// **The columns the person named are the answer's (run-mwb2kkv5-1baeee11).** A saved Flow's read is declared from the
// person's words at assembly (`runtime/flow-authoring/bootstrap/authoring/assembled-record-output.ts`) and the domain narrows
// it to them. A result was not: a read the model ran stored every field it read under a schema derived from its rows, and a
// replayed step's record output is derived without the named columns, so that run delivered name, price, rating and a `link`
// nobody asked for, to the chat, the store and the judge alike, while its saved Flow dropped it. So a read's processing, and a
// run's batch's, gains `columns` -- how a record output says which columns are its answer -- set to the ones the request
// names, in its order (`askedColumns`). The batch is stored with it: its rows are collected whole, and the store's answer (its
// page and export), this summary and the read-back show those columns. The contract makes any `columns` the default dedupe
// key, and that would merge two distinct rows alike in every named column (two listings told apart only by their links) into
// one, an answer silently a row short; so the row's identity stays every stored column, as it was before the columns were
// set, unless the processing declared its own dedupe. A `where` the processing declared over a column left out stays shown,
// as the contract requires.
// Only where every named column is a stored column, met exactly or with case and separators set aside as the build matches one:
// a name none meets may be a column stored under another name ("url" read as `link`), and dropping the rest would drop a
// column the person asked for. Nothing changes with no instruction, one that names no column, processing that declares its
// own `columns`, named columns that are already every stored column in order, or a result the contract would not take. The
// names come from the one reader of the person's words (`automationStudioFlowBootstrapInstructionColumns`); a closing item
// that ran on is closed by the leading words that name a stored column, as assembly closes it.
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordProcessing, validateAutomationStudioRecords, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { automationStudioRecordBatchKey } from "../../../../../engine/automation/records/index.ts";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapInstructionColumns, type AutomationStudioFlowBootstrapInstructionColumnList } from "../../../../../runtime/flow-authoring/bootstrap/answerability/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstAddressSplit } from "./address-split.ts";
import { automationStudioAnswerFirstReadColumns } from "./carried-columns.ts";
import { automationStudioAnswerFirstReadDatasetId, automationStudioAnswerFirstRecordedReadKey } from "./dataset-of-read.ts";
import { automationStudioAnswerFirstReadSchema } from "./derived-schema.ts";
import { automationStudioAnswerFirstReadRows } from "./found-rows.ts";
import { automationStudioAnswerFirstListAfterRead } from "./list-after-read.ts";
import type { AutomationStudioAnswerFirstListPage, AutomationStudioAnswerFirstReadPage } from "./list-page.ts";
import { automationStudioAnswerFirstProcessedRows } from "./processed-rows.ts";
import { automationStudioAnswerFirstBatchLeftOut, automationStudioAnswerFirstReadConditions, automationStudioAnswerFirstReadEvidenceOf } from "./read-evidence.ts";
import type { AutomationStudioAnswerFirstReadEvidence } from "./read-evidence-type.ts";
import type { AutomationStudioAnswerFirstResultChange } from "./result-change.ts";
import { automationStudioAnswerFirstResultDataset } from "./result-dataset.ts";
import { automationStudioAnswerFirstRowTies } from "./row-ties.ts";
import type { AutomationStudioAnswerFirstRowCall } from "./rows-call.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";
import type { AutomationStudioAnswerFirstRowSinkInput } from "./sink-input.ts";
import type { AutomationStudioAnswerFirstRowSink } from "./sink-type.ts";

/** Rows asked of the store in one page when reading back. */
const READ_BACK_PAGE = 200;

type Held = {
  schema: AutomationStudioRecordSchema;
  rows: JsonObject[];
  truncated: boolean;
  /** Each read's rows since the list last started over. */
  pages: AutomationStudioAnswerFirstListPage[];
  /** The view of the site the list's last read read. A run's batches say none. */
  view?: string | undefined;
  /** The model marked its reads working ones. */
  lookUp?: boolean | undefined;
  /** The conditions every row of the list met (header); absent is none. */
  conditions?: readonly string[] | undefined;
  /** Its latest read lacked a condition of the result, so it is not the result while another list stands (header). */
  aside?: boolean | undefined;
  /** The name a read's record output gave the list, or a run's dataset: what says a later read is of it (header). */
  named?: string | undefined;
  /** The columns this dataset's id was made from, where a read made it: what an empty read is matched by (header). */
  idColumns?: readonly string[] | undefined;
  /** The call that last stored rows in this list, where a call of the exploration did (header). */
  by?: string | undefined;
  /** The most rows the list held before a read started it over. */
  earlierRows?: number | undefined;
  /** The latest read started the list over from rows it held. */
  startedOver?: boolean | undefined;
  label?: string | undefined;
  process?: AutomationStudioRecordProcessing | undefined;
  /** The processing the store holds for this dataset: it is fixed within a run, so a later read can differ from it and the read-back then applies `process` itself. */
  sent?: AutomationStudioRecordProcessing | undefined;
};

export function automationStudioAnswerFirstRowSink(input: AutomationStudioAnswerFirstRowSinkInput): AutomationStudioAnswerFirstRowSink {
  const datasets = new Map<string, Held>();
  /** Dataset ids in the order rows were stored to them. */
  const order: string[] = [];
  /** The datasets a saved Flow's run wrote, while its rows stand (`runRowsRefused`). */
  const ran = new Set<string>();
  /** Reads that answered, rows or none, not lost to the store (`readsAnswered`). */
  let readsAnswered = 0;
  /** The list each read the model made went to, by the saved step it is: what a replay of that step reads (header). */
  const recorded = new Map<string, string>();
  /** The columns the person's request names, read once (header). */
  const named = automationStudioFlowBootstrapInstructionColumns(input.instructionText ?? "");

  const movedFrom = (held: Held, evidence: AutomationStudioAnswerFirstReadEvidence): boolean => held.view !== undefined && evidence.list !== undefined && held.view !== evidence.list;

  /** The latest dataset a run wrote that takes these rows whole (header), and what they come to under it. */
  const joined = (columns: readonly string[], found: readonly unknown[], evidence: AutomationStudioAnswerFirstReadEvidence) => {
    const latest = order.filter((datasetId) => ran.has(datasetId)).at(-1) ?? [...ran].at(-1);
    const held = latest === undefined ? undefined : datasets.get(latest);
    if (latest === undefined || !held || evidence.lookUp || (evidence.named !== undefined && evidence.named !== latest) || !held.schema.fields.every((field) => columns.includes(field.id)) || !meets(evidence.conditions, held.conditions)) return undefined;
    const validated = validateAutomationStudioRecords(found, held.schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    if (validated.invalidCount > 0) return undefined;
    const shares = automationStudioAnswerFirstRowTies(held.rows, validated.rows, held.schema.fields.map((field) => field.id)).some((tie) => tie !== undefined);
    return movedFrom(held, evidence) && !shares ? undefined : { datasetId: latest, held, validated };
  };

  /** A saved step's replay as the read it replays (header): that read's list and the rows as they fit it, or `undefined`. */
  const replayed = (call: AutomationStudioAnswerFirstRowCall, columns: readonly string[], found: readonly unknown[], evidence: AutomationStudioAnswerFirstReadEvidence) => {
    if (typeof call.value.replay !== "string") return undefined;
    const datasetId = recorded.get(automationStudioAnswerFirstRecordedReadKey(call));
    const held = datasetId === undefined ? undefined : datasets.get(datasetId);
    if (datasetId === undefined || !held || !meets(evidence.conditions, held.conditions) || !held.schema.fields.some((field) => columns.includes(field.id))) return undefined;
    const validated = validateAutomationStudioRecords(found, held.schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
    return validated.invalidCount > 0 ? undefined : { datasetId, held, validated };
  };

  /** A read that answered no rows, kept as an empty page of the list it is the same read of, at a place that list has not read (header). */
  const emptyPage = (call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult): void => {
    const evidence = automationStudioAnswerFirstReadEvidenceOf(call, answer, input.readRowsKey);
    const place = evidence.place;
    if (evidence.lookUp || place === undefined) return;
    for (const [datasetId, held] of datasets) {
      if (held.lookUp || held.idColumns === undefined) continue;
      if (automationStudioAnswerFirstReadDatasetId({ toolId: call.toolId, value: call.value, columns: held.idColumns, named: evidence.named, list: evidence.list, lookUp: evidence.lookUp }) !== datasetId) continue;
      if (!held.pages.some((page) => page.place === place)) held.pages.push({ rows: [], place, ...(evidence.list !== undefined ? { where: evidence.list } : {}), ...(evidence.leftOut ? { leftOut: evidence.leftOut } : {}) });
      return;
    }
  };

  /** The dataset that is the result: a working read, or a list set aside (header), only while no other stands. */
  const resultDataset = (): string | undefined => {
    const standing = order.filter((datasetId) => !datasets.get(datasetId)?.lookUp && !datasets.get(datasetId)?.aside);
    return automationStudioAnswerFirstResultDataset(standing.length ? standing : order, ran.size ? { ids: ran, rowsOf: (id) => datasets.get(id)?.rows.length ?? 0 } : undefined);
  };

  const summary = (): AutomationStudioAnswerFirstRowsSummary => {
    const datasetId = resultDataset();
    const held = datasetId === undefined ? undefined : datasets.get(datasetId);
    if (datasetId === undefined || !held) return { totalRows: 0, truncated: false, columns: [], rows: [] };
    const answer = held.process ? automationStudioAnswerFirstProcessedRows(held.rows, held.schema, held.process) : { rows: held.rows.map((row) => ({ ...row })), columns: held.schema.fields.map(({ id, label }) => ({ id, label })) };
    return { datasetId, totalRows: answer.rows.length, truncated: held.truncated, columns: answer.columns, rows: answer.rows, ...fewer(held) };
  };

  /** The result as it stands, for telling a read that changed it (header); none while no list that is not a working one holds a row. */
  const standing = () => {
    const now = summary();
    const held = now.datasetId === undefined ? undefined : datasets.get(now.datasetId);
    if (now.datasetId === undefined || !held || held.lookUp || held.rows.length === 0) return undefined;
    return { datasetId: now.datasetId, rows: [...held.rows], totalRows: now.totalRows, columns: now.columns.map((column) => column.id), pages: pagesOf(held), by: held.by, conditions: held.conditions ?? [] };
  };

  /** A read is of this list (header): it names it; else the view, where both say one; else it returns every column of it. */
  const ofList = (list: Held | undefined, evidence: AutomationStudioAnswerFirstReadEvidence, columns: readonly string[]): boolean => {
    if (!list) return false;
    if (evidence.named !== undefined && evidence.named === list.named) return true;
    const views = [list.view, ...list.pages.map((page) => page.where)].filter((view) => view !== undefined);
    return evidence.list !== undefined && views.length ? views.includes(evidence.list) : list.schema.fields.every((field) => columns.includes(field.id));
  };

  /** Sets a read's list aside where it is a read of the result's list that, after it, lacks a condition of the result as it stood, and says so (header); `undefined` where it may be the result. */
  const heldApart = (was: ReturnType<typeof standing>, datasetId: string, held: Held, evidence: AutomationStudioAnswerFirstReadEvidence, columns: readonly string[]): AutomationStudioAnswerFirstResultChange | undefined => {
    held.aside = !(!was || was.datasetId === datasetId || held.lookUp || evidence.says === "replace" || meets(held.conditions, was.conditions) || !ofList(datasets.get(was.datasetId), evidence, columns));
    if (!was || !held.aside) return undefined;
    const missing = was.conditions.filter((condition) => !(held.conditions ?? []).includes(condition)).map((condition) => JSON.parse(condition) as JsonValue);
    return { kind: "held_apart", now: { rows: was.totalRows, pages: was.pages }, apart: { rows: held.rows.length, pages: pagesOf(held) }, missing };
  };

  /** How this read changed the result, from what stood just before it (header), or nothing to tell. */
  const changed = (was: ReturnType<typeof standing>, datasetId: string, over: boolean): AutomationStudioAnswerFirstResultChange | undefined => {
    const now = standing();
    if (!was || !now || now.datasetId !== datasetId) return undefined;
    const before = { rows: was.totalRows, columns: was.columns, pages: was.pages, ...(was.by !== undefined ? { lastReadBy: was.by } : {}) };
    if (was.datasetId !== datasetId) return { kind: "other_list", now: { rows: now.totalRows, pages: now.pages }, before };
    if (!over) return undefined;
    // Only a start-over that left out a row it held: a read of the whole list again loses nothing.
    const kept = new Set(automationStudioAnswerFirstRowTies(was.rows, now.rows, datasets.get(datasetId)!.schema.fields.map((field) => field.id)).filter((tie) => tie !== undefined));
    return kept.size < was.rows.length ? { kind: "started_over", now: { rows: now.totalRows, pages: now.pages }, before } : undefined;
  };

  return {
    async fromCall(call, answer) {
      const found = automationStudioAnswerFirstReadRows(answer, input.readRowsKey);
      if (!found) return undefined;
      const objects = found.filter(isObject);
      if (!found.length) {
        readsAnswered += 1;
        emptyPage(call, answer);
        return { rows: [], invalidCount: 0, truncated: false };
      }
      const was = standing();
      const columns = automationStudioAnswerFirstReadColumns(objects);
      const evidence = automationStudioAnswerFirstReadEvidenceOf(call, answer, input.readRowsKey);
      // A replay of a step the model read goes into that read's list first; else the latest run's list it fits whole (header).
      const join = replayed(call, columns, found, evidence) ?? joined(columns, found, evidence);
      const idOf = (named: string | undefined) => automationStudioAnswerFirstReadDatasetId({ toolId: call.toolId, value: call.value, columns, named, list: evidence.list, lookUp: evidence.lookUp });
      const asNamed = join?.datasetId ?? idOf(evidence.named);
      // Never into a list whose conditions it lacks, short of `replace`: it is then a list of its own, as if unnamed (header).
      const into = join ? undefined : datasets.get(asNamed);
      const datasetId = !into || into.lookUp || evidence.says === "replace" || meets(evidence.conditions, into.conditions) ? asNamed : idOf(undefined);
      // A later page of the same list keeps the schema the first page fixed: the store refuses a dataset whose schema changes within a run.
      const known = datasets.get(datasetId);
      const schema = known?.schema ?? automationStudioAnswerFirstReadSchema(objects);
      if (!schema) return { rows: [], invalidCount: found.length, truncated: false, failure: { code: "answer_first.rows_no_columns" } };
      const validated = join?.validated ?? validateAutomationStudioRecords(found, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
      const declared = askedColumns(named, schema, declaredProcess(evidence.process, schema));
      /** A dataset keeps the processing it first stored with: the store refuses it changing within a run. */
      const sending = known ? known.sent : declared;
      const read = wholeOnce(validated.rows);
      const after = read.length === 0 ? undefined : automationStudioAnswerFirstListAfterRead({ pages: known?.pages ?? [], held: known?.rows ?? [], read, columns: schema.fields.map((field) => field.id), evidence, moved: known !== undefined && movedFrom(known, evidence) });
      const truncated = after && !after.over ? validated.truncated || known?.truncated === true : validated.truncated;
      const addsOnly = !after || stableJson(wholeOnce([...(known?.rows ?? []), ...validated.rows])) === stableJson(after.rows);
      const batch: AutomationStudioRecordBatch = {
        nodeId: `exploration.${call.toolId}`,
        attemptId: call.callId,
        batchKey: automationStudioRecordBatchKey([], call.callId),
        datasetId,
        ...(join?.held.label !== undefined ? { label: join.held.label } : {}),
        writeMode: addsOnly ? "append" : "replace",
        schema,
        rows: addsOnly ? validated.rows : after.rows,
        invalidCount: validated.invalidCount,
        truncated: addsOnly ? validated.truncated : truncated,
        ...(sending !== undefined ? { process: sending } : {})
      };
      try {
        await input.onRecordBatch(batch);
      } catch (error) {
        return { rows: [], datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, failure: { code: "answer_first.rows_not_stored", ...(error instanceof Error ? { errorName: error.name } : {}) } };
      }
      readsAnswered += 1;
      const held: Held = known ?? { schema, rows: [], truncated: false, pages: [], lookUp: evidence.lookUp, sent: sending, conditions: evidence.conditions, ...(join ? {} : { idColumns: columns }), ...(datasetId === asNamed ? { named: evidence.named } : {}) };
      datasets.set(datasetId, held);
      // The step this read is, as its replays will send it (header).
      if (typeof call.value.replay !== "string" && answer.draft?.ranWith !== undefined) recorded.set(automationStudioAnswerFirstRecordedReadKey({ toolId: call.toolId, value: answer.draft.ranWith }), datasetId);
      if (evidence.list !== undefined) held.view = evidence.list;
      if (after) {
        if (known) held.conditions = after.over ? evidence.conditions : common(held.conditions, evidence.conditions);
        held.startedOver = after.over && held.rows.length > 0;
        if (after.over && held.rows.length > 0) held.earlierRows = Math.max(held.earlierRows ?? 0, held.rows.length);
        held.rows = after.rows;
        held.pages = after.pages;
        held.truncated = truncated;
        // What the read declared shapes its result as a saved run's would. The stored rows stay as the read returned them (the act record ties to them). The store keeps the first processing a dataset was stored with and refuses a change within a run, so where this differs from it the summary and the read-back apply it themselves, and both read the same.
        if (!ran.has(datasetId)) held.process = declared;
        held.by = call.callId;
        order.push(datasetId);
      }
      const apart = after ? heldApart(was, datasetId, held, evidence, columns) : undefined;
      const resultChanged = apart ?? (after ? changed(was, datasetId, after.over) : undefined);
      return { rows: validated.rows, datasetId, invalidCount: validated.invalidCount, truncated: validated.truncated, ...(after?.over ? { startedOver: true } : {}), ...(resultChanged ? { resultChanged } : {}) };
    },
    async recordBatch(given) {
      // The same for every batch of a dataset, whose schema and processing the store fixes within a run (header).
      const process = askedColumns(named, given.schema, given.process);
      const batch: AutomationStudioRecordBatch = process === undefined || process === given.process ? given : { ...given, process };
      const stored = await input.onRecordBatch(batch);
      readsAnswered += 1;
      const asked = automationStudioAnswerFirstReadConditions(batch.leftOut?.parameters);
      const held: Held = datasets.get(batch.datasetId) ?? { schema: batch.schema, rows: [], truncated: false, pages: [], label: batch.label, process: batch.process, sent: batch.process, conditions: asked, named: batch.datasetId };
      datasets.set(batch.datasetId, held);
      if (batch.writeMode === "replace") held.conditions = asked;
      else if (batch.rows.length) held.conditions = common(held.conditions, asked);
      if (batch.rows.length) held.aside = false; // Its read's conditions where the batch carries its account, and a run is never set aside (header).
      // As the store reads it: `replace` clears what the dataset held.
      if (batch.writeMode === "replace") {
        held.rows = [];
        held.pages = [];
      }
      held.rows = wholeOnce([...held.rows, ...batch.rows]);
      // A saved run's read says which page it read only where its answer did (`location`); its view stays unset, as a run's batches have never set it, so which list a later read joins is as before.
      const at = batch.location === undefined ? undefined : automationStudioAnswerFirstAddressSplit(batch.location);
      // And what its own conditions left out, where its answer said, as a read the model made says it (`./read-evidence.ts`, run-mwaudvnh-c208d32c).
      const leftOut = automationStudioAnswerFirstBatchLeftOut(batch.leftOut);
      const told = { ...(at ? { where: at.view } : {}), ...(at?.place !== undefined ? { place: at.place } : {}), ...(leftOut ? { leftOut } : {}) };
      if (batch.rows.length) held.pages.push({ rows: wholeOnce(batch.rows), ...told });
      // A run's later page that kept no row is told as read, as an exploring read's is (header); so is one that kept none and said what it left out.
      else if (at?.place !== undefined ? !held.pages.some((page) => page.place === at.place) : leftOut !== undefined) held.pages.push({ rows: [], ...told });
      held.truncated ||= batch.truncated;
      ran.add(batch.datasetId);
      if (batch.rows.length) order.push(batch.datasetId);
      return stored;
    },
    runRowsRefused() {
      ran.clear();
    },
    readsAnswered: () => readsAnswered,
    readPages: () => {
      const id = resultDataset();
      const held = id === undefined ? undefined : datasets.get(id);
      return held ? readPagesOf(held) : [];
    },
    summary,
    async readBack() {
      const own = summary();
      const reader = input.reader;
      if (!reader || own.datasetId === undefined) return { ...own, fromStore: false };
      const held = datasets.get(own.datasetId);
      try {
        await reader.process?.();
        const stored = (await reader.listDatasets()).find((dataset) => dataset.datasetId === own.datasetId);
        if (!stored) return { ...own, fromStore: false };
        const rows: JsonObject[] = [];
        let cursor: string | undefined;
        let columns = own.columns;
        let schema = held?.schema;
        do {
          const page = await reader.getPage({ datasetId: own.datasetId, limit: READ_BACK_PAGE, ...(cursor !== undefined ? { cursor } : {}) });
          if (!page) return { ...own, fromStore: false };
          columns = page.schema.fields.map(({ id, label }) => ({ id, label }));
          schema = page.schema;
          rows.push(...page.rows);
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        const shrunk = held ? fewer(held) : {};
        // Processed, the dataset answers with its own dedupe. Before that (a completion judged while the
        // attempt's session is open) it holds every batch as collected, a run's and a read's of the same rows
        // among them, so it is made here what processing will make it: what the judge reads is what the person will.
        if (stored.processing !== undefined && stableJson(held?.process ?? null) === stableJson(held?.sent ?? null)) return { datasetId: own.datasetId, totalRows: stored.recordCount, truncated: stored.truncated || own.truncated, columns, rows, fromStore: true, ...shrunk };
        const answer = held?.process && schema ? automationStudioAnswerFirstProcessedRows(rows, schema, held.process) : { rows: wholeOnce(rows), columns };
        return { datasetId: own.datasetId, totalRows: answer.rows.length, truncated: stored.truncated || own.truncated, columns: answer.columns, rows: answer.rows, fromStore: true, ...shrunk };
      } catch {
        return { ...own, fromStore: false };
      }
    }
  };
}

/** A read's declared `process` read against its schema as the contract reads it; one it does not accept shapes nothing. */
function declaredProcess(declared: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessing | undefined {
  if (declared === undefined) return undefined;
  const parsed = parseAutomationStudioRecordProcessing(declared, schema);
  return parsed.ok ? parsed.processing : undefined;
}

/** `process` with the answer's columns set to the ones `named` names, in that order, or `process` itself where nothing is to change (header). */
function askedColumns(named: AutomationStudioFlowBootstrapInstructionColumnList, schema: AutomationStudioRecordSchema, process: AutomationStudioRecordProcessing | undefined): AutomationStudioRecordProcessing | undefined {
  if (process?.columns !== undefined) return process;
  const stored = schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
  const names = closedNames(named, stored);
  const matched = names.length ? namedColumnsOf(names, stored) : undefined;
  if (matched === undefined) return process;
  const filtered = (process?.where ?? []).map((condition) => condition.field).filter((field, at, all) => !matched.includes(field) && all.indexOf(field) === at);
  const columns = [...matched, ...filtered];
  if (columns.length === stored.length && columns.every((column, at) => stored[at] === column)) return process;
  // A row is still told apart by every column it stores, not by the fewer it shows (header); a declared dedupe stands.
  const dedupe = process?.dedupe ?? { by: stored };
  const parsed = parseAutomationStudioRecordProcessing({ ...(process ?? {}), dedupe, columns }, schema);
  return parsed.ok ? parsed.processing : process;
}

/** The named columns, a closing item that ran on closed by the longest leading words that name a stored column (header); none where none does. */
function closedNames(named: AutomationStudioFlowBootstrapInstructionColumnList, stored: readonly string[]): readonly string[] {
  const cut = named.cutShort;
  if (cut === undefined) return named;
  const leading = cut.leading.find((name) => namedColumnsOf([name], stored) !== undefined);
  return leading === undefined ? [] : [...cut.named, leading];
}

/** Each name's stored column, each column once, in the names' order; `undefined` when a name meets none (header). */
function namedColumnsOf(names: readonly string[], stored: readonly string[]): string[] | undefined {
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  const taken: string[] = [];
  for (const name of names) {
    const column = stored.find((id) => id === name && !taken.includes(id)) ?? stored.find((id) => !taken.includes(id) && key(id) !== "" && key(id) === key(name));
    if (column === undefined) return undefined;
    taken.push(column);
  }
  return taken;
}

/** Every condition of a list is one of a read's (header): the same ones, or those and more. A list of none is met by any read. */
function meets(read: readonly string[] | undefined, list: readonly string[] | undefined): boolean {
  return (list ?? []).every((condition) => (read ?? []).includes(condition));
}
/** The conditions two reads of one list share: what every row of it met. */
function common(list: readonly string[] | undefined, read: readonly string[] | undefined): string[] {
  return (list ?? []).filter((condition) => (read ?? []).includes(condition));
}

/** What a list that got shorter says of it (`./rows-summary.ts`). */
function fewer(held: Held): Pick<AutomationStudioAnswerFirstRowsSummary, "fewerThanEarlier" | "startedOver"> {
  return {
    ...(held.earlierRows !== undefined && held.earlierRows > held.rows.length ? { fewerThanEarlier: { earlierRows: held.earlierRows } } : {}),
    ...(held.startedOver ? { startedOver: true as const } : {})
  };
}

/** A list's reads as a changed result is told: the view and place each read, where said, and how many rows it kept. */
function pagesOf(held: Held): AutomationStudioAnswerFirstReadPage[] {
  return held.pages.map((page) => ({ ...(page.where !== undefined ? { where: page.where } : {}), ...(page.place !== undefined ? { place: page.place } : {}), kept: page.rows.length }));
}

/** A list's reads as the judge is told them (`readPages`): as `pagesOf`, with the rows each kept and what its conditions left out, where its answer said (header). */
function readPagesOf(held: Held): AutomationStudioAnswerFirstReadPage[] {
  return pagesOf(held).map((told, at) => {
    const page = held.pages[at]!;
    return { ...told, ...(page.rows.length ? { rows: page.rows.map((row) => ({ ...row })) } : {}), ...(page.leftOut ? { leftOut: page.leftOut } : {}) };
  });
}

/** Rows without a row repeated whole, the first of each staying where it was. */
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
