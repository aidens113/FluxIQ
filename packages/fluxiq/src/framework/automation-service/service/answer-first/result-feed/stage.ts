import { automationStudioRecordProcessingRefusalText, processAutomationStudioRecordRows, type AutomationStudioRecordCollectedRow, type AutomationStudioRecordProcessing, type AutomationStudioRecordProcessingAccount, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstBoundProcessing, automationStudioAnswerFirstProcessingInputs, type AutomationStudioAnswerFirstProcessingDeclaration } from "../result-processing/index.ts";
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstResultReadiness } from "./readiness.ts";
import { automationStudioAnswerFirstMergedProcessing } from "./merged-processing.ts";
import { automationStudioAnswerFirstColumnNames, type AutomationStudioAnswerFirstColumnNames } from "./column-names.ts";
import { automationStudioAnswerFirstAskedRenames, automationStudioAnswerFirstAskedView } from "./asked-view.ts";

/** What the stage names fields by beside their ids (`./column-names.ts`, t1074): the rows they are read from, the request's sure columns and the output reads' renamed keys. */
export type AutomationStudioAnswerFirstNaming = { rows: readonly Readonly<Record<string, unknown>>[]; asked?: readonly string[] | undefined; renamed?: Readonly<Record<string, string>> | undefined };

/** One instruction declaration, bound from actual capture schema and applied through the shared evaluator. */
export function automationStudioAnswerFirstDataStage(initial: AutomationStudioAnswerFirstProcessingDeclaration | undefined, referenceTimeMs: number | null | undefined, requiresData = false, inputs?: Readonly<Record<string, JsonValue>>) {
  let declaration = initial === undefined ? undefined : structuredClone(initial);
  let cached: { key: string; resolved: ReturnType<typeof automationStudioAnswerFirstProcessingInputs>; result: ReturnType<typeof automationStudioAnswerFirstBoundProcessing> } | undefined;
  let bound: AutomationStudioRecordProcessing | undefined;
  let stored: JsonObject | undefined;
  /** The latest naming of the result's fields, for the tool's answer (`./column-names.ts`). */
  let named: AutomationStudioAnswerFirstColumnNames | undefined;
  let readiness: AutomationStudioAnswerFirstResultReadiness = declaration === undefined ? { state: "legacy" } : declaration.task === null ? { state: "not-applicable" } : { state: "missing-evidence", code: "answer_first.processing_not_ready", reason: "The data declaration has not yet been applied to captured evidence." };
  const missing = (code: string, reason: string) => {
    readiness = { state: "missing-evidence", code, reason };
    return { readiness };
  };
  /** A process as written, its explicit inputs resolved, bound to `schema` and stamped with this declaration. */
  const attempt = (raw: JsonValue, schema: AutomationStudioRecordSchema, aliases: Readonly<Record<string, string>>) => {
    const resolved = automationStudioAnswerFirstProcessingInputs(raw, inputs);
    return { resolved, result: resolved.ok ? automationStudioAnswerFirstBoundProcessing(resolved.resolved, schema, declaration!, aliases) : { ok: false as const, issues: resolved.issues, unresolved: [] } };
  };
  // The read's own process with the task's declaration over it, by the rule the legacy path uses (`./merged-processing.ts`).
  // A read's process the contract does not accept shapes nothing (`./feed.ts` header): the declaration alone then binds,
  // and its own failure is the one reported, so a requested condition is never dropped. The person's sure columns are
  // the task's where it names none, so a read's own `columns` never hides what the person asked for.
  const bind = (schema: AutomationStudioRecordSchema, askedColumns: readonly string[] | undefined, read: unknown, aliases: Readonly<Record<string, string>> = {}) => {
    const process = declaration?.task?.process;
    if (process === undefined) return { ok: false as const, issues: ["Processing declaration is missing."], unresolved: [] };
    const task = isObject(process) && process.columns === undefined && askedColumns?.length ? { ...process, columns: [...askedColumns] } : process;
    const own = readProcess(read, declaration!);
    const key = stableJson({ schema, declaration, askedColumns: askedColumns ?? null, own: own ?? null, aliases });
    if (cached?.key !== key) {
      const both = own === undefined ? undefined : attempt(automationStudioAnswerFirstMergedProcessing(own, task) as JsonValue, schema, aliases);
      cached = { key, ...(both?.result.ok ? both : attempt(task, schema, aliases)) };
    }
    const { resolved, result } = cached;
    stored = result.ok && resolved.ok ? resolved.stored(JSON.parse(JSON.stringify(result.processing)) as JsonObject) : undefined;
    if (result.ok && stored === undefined) return { ok: false as const, issues: ["The canonical process cannot retain an explicit input value position. Repair the declaration."], unresolved: [] };
    return result;
  };
  return {
    declaration: () => declaration === undefined ? undefined : structuredClone(declaration),
    processing: () => bound === undefined ? undefined : structuredClone(bound),
    storedProcessing: () => bound === undefined || stored === undefined ? undefined : structuredClone(stored),
    readiness: () => readiness,
    /** How the latest evaluation named the result's fields (`./column-names.ts`, t1074); absent before one. */
    naming: () => named,
    active: () => declaration !== undefined && (declaration.task !== null || requiresData),
    evaluate(input: { schema?: AutomationStudioRecordSchema; schemaIssues?: readonly string[]; rows: readonly AutomationStudioRecordCollectedRow[]; columns: readonly string[]; askedColumns?: readonly string[] | undefined; own?: unknown; renamed?: Readonly<Record<string, string>> | undefined }): { readiness: AutomationStudioAnswerFirstResultReadiness; summary?: Pick<AutomationStudioAnswerFirstRowsSummary, "rows" | "columns" | "schema">; processing?: AutomationStudioRecordProcessing; account?: AutomationStudioRecordProcessingAccount; renames?: ReadonlyMap<string, { id: string; label: string }>; storedRows?: JsonObject[] } {
      bound = undefined;
      stored = undefined;
      named = undefined;
      if (declaration === undefined) {
        readiness = { state: "legacy" };
        return { readiness };
      }
      if (declaration.task === null && requiresData) return missing("answer_first.processing_data_required", "This task has an explicit records or data-output requirement. Action-only N/A cannot satisfy it; capture its source schema and declare the requested processing criteria.");
      if (declaration.task === null) {
        readiness = { state: declaration === undefined ? "legacy" : "not-applicable" };
        return { readiness };
      }
      if (declaration.task.process === undefined) return missing("answer_first.processing_declaration_missing", "The task's semantic processing declaration is missing. Use core.set_result_processing once with why: for data, capture the actual retained source schema and give the requested conditions/order/columns (process: {} when no extra criteria); only an action-only task with no explicit data requirement may first declare process: null. Omission is not legacy/N/A.");
      const currentInputs = automationStudioAnswerFirstProcessingInputs(declaration.task.process, inputs);
      if (!currentInputs.ok) return missing("answer_first.processing_inputs_unavailable", currentInputs.issues.join(" "));
      if (!Number.isSafeInteger(referenceTimeMs) || (referenceTimeMs as number) < 0) return missing("answer_first.processing_reference_missing", "The original processing reference time is unavailable. Recover the validated original attempt reference or collect fresh evidence in a new logical attempt; the current clock cannot reinterpret old relative dates.");
      if (!input.schema) return missing("answer_first.processing_schema_missing", input.schemaIssues?.join(" ") ?? "No full retained schema is available for the result's contributing pages. Capture the required source fields.");
      // The fields' other names: a renamed read's old keys and the request's columns placed by evidence (t1074).
      const naming: AutomationStudioAnswerFirstNaming = { rows: input.rows.map((row) => row.values), asked: input.askedColumns, renamed: input.renamed };
      named = automationStudioAnswerFirstColumnNames({ schema: input.schema, ...naming });
      const parsed = bind(input.schema, input.askedColumns, input.own, named.aliases);
      const said = (text: string): string => (named?.text ? `${text} ${named.text}` : text);
      // Each refused part and unbound reference says why (t1070, `automationStudioRecordProcessingRefusalText`).
      if (!parsed.ok) return missing("answer_first.processing_binding_missing", said(`${automationStudioRecordProcessingRefusalText(parsed, input.schema)} Bind the written references to actual retained fields; do not drop a requested condition.`));
      const process = parsed.processing;
      // The declaration's own columns, bound, place what evidence alone could not (`automationStudioRecordAskedColumns`, order).
      if (process.columns) named = automationStudioAnswerFirstColumnNames({ schema: input.schema, ...naming, columns: process.columns });
      bound = process;
      const evaluated = processAutomationStudioRecordRows({ rows: input.rows, schema: input.schema, process, now: referenceTimeMs as number, mode: "automatic" });
      if (evaluated.state === "missing-evidence") return missing("answer_first.processing_evidence_missing", `Required data evidence is unavailable: ${evaluated.missingEvidence.map((entry) => `${entry.operator}[${entry.index}] ${entry.field}${entry.from ? ` from ${entry.from}` : ""} (${entry.reason}) at source ${entry.source.batchKey}, step ${entry.source.nodeId}, row ${entry.source.row}`).join("; ")}. Read the named fields for those source occurrences.`);
      if (evaluated.state === "empty") {
        const withheld = missing("answer_first.processing_empty", said(`The declared data task is not ready: ${evaluated.reason === "uncollected" ? "no captured records" : "no qualifying records"}; ${evaluated.account.kept} rows kept. Gather the requested matching evidence. An intentionally empty contract must explicitly permit minRows: 0.`));
        return { ...withheld, account: evaluated.account };
      }
      if (evaluated.account.belowMinRows !== undefined) return { ...missing("answer_first.processing_below_min_rows", `The data declaration requires at least ${evaluated.account.belowMinRows} rows, but only ${evaluated.account.kept} qualify. Gather the remaining matching evidence.`), account: evaluated.account };
      readiness = { state: "ready" };
      const shown = process.columns ?? (input.columns.length ? input.columns : input.schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id));
      // The answer shows each placed field under the request's name (`./asked-view.ts`, t1074); the stored rows stay as read.
      const renames = automationStudioAnswerFirstAskedRenames(named.asked, input.schema);
      const storedRows = evaluated.retainedRows as JsonObject[];
      const summary = automationStudioAnswerFirstAskedView({
        schema: structuredClone(input.schema),
        rows: storedRows,
        columns: shown.flatMap((id) => input.schema!.fields.filter((field) => field.id === id && field.handling !== "exclude").map(({ id, label }) => ({ id, label })))
      }, renames);
      return { readiness, processing: process, account: evaluated.account, summary, renames, storedRows };
    },
    amend(process: JsonValue, why: string | undefined, schema: AutomationStudioRecordSchema | undefined, naming?: AutomationStudioAnswerFirstNaming): { ok: true; changed: boolean } | { ok: false; reason: string } {
      if (declaration === undefined) return { ok: false, reason: "This is a legacy task; use its existing processing tool." };
      if (process === null) {
        if (requiresData) return { ok: false, reason: "An explicit records/data-output requirement cannot be replaced by action-only N/A." };
        if (declaration.task === null) return { ok: true, changed: false };
        if (declaration.task.process !== undefined) return { ok: false, reason: "Action-only N/A cannot erase an existing data declaration, including invalid or unresolved criteria. Repair its evidence or binding explicitly." };
        if (!why?.trim()) return { ok: false, reason: "The first action-only declaration needs why explaining the requested goal has no data answer." };
        if (!Number.isSafeInteger(declaration.revision + 1)) return { ok: false, reason: "The processing revision is invalid; repair its provenance." };
        declaration = { ...declaration, revision: declaration.revision + 1, task: null };
        cached = undefined;
        bound = undefined;
        return { ok: true, changed: true };
      }
      if (!schema) return { ok: false, reason: "Capture the result's full retained schema before amending its data declaration." };
      const next = { ...declaration, task: { process } };
      const values = automationStudioAnswerFirstProcessingInputs(process, inputs);
      if (!values.ok) return { ok: false, reason: values.issues.join(" ") };
      const names = naming ? automationStudioAnswerFirstColumnNames({ schema, ...naming }) : undefined;
      const parsed = automationStudioAnswerFirstBoundProcessing(values.resolved, schema, next, names?.aliases);
      // Run run-mwyg0x66-4d561a42 was refused here fourteen times with only the code (t1070): each part now says why.
      if (!parsed.ok) return { ok: false, reason: [automationStudioRecordProcessingRefusalText(parsed, schema), names?.text].filter(Boolean).join(" ") };
      const currentValues = declaration.task === null || declaration.task.process === undefined ? undefined : automationStudioAnswerFirstProcessingInputs(declaration.task.process, inputs);
      const current = currentValues?.ok ? automationStudioAnswerFirstBoundProcessing(currentValues.resolved, schema, declaration, names?.aliases) : undefined;
      const withoutStamp = (value: AutomationStudioRecordProcessing) => {
        const { declaration: _stamp, ...criteria } = value;
        return criteria;
      };
      const bindingPaths = (value: ReturnType<typeof automationStudioAnswerFirstProcessingInputs>) => value.ok ? value.bindings.map(({ path, name }) => ({ path, name })) : [];
      if (current?.ok && stableJson(withoutStamp(current.processing)) === stableJson(withoutStamp(parsed.processing)) && stableJson(currentValues ? bindingPaths(currentValues) : []) === stableJson(bindingPaths(values))) return { ok: true, changed: false };
      if (!why?.trim()) return { ok: false, reason: "A processing amendment needs why naming the changed source evidence or the person's correction. Existing conditions remain held until an explicit amendment is justified." };
      if (!Number.isSafeInteger(declaration.revision + 1)) return { ok: false, reason: "The processing declaration revision is invalid; repair its provenance." };
      declaration = { ...next, revision: declaration.revision + 1 };
      cached = undefined;
      bound = undefined;
      return { ok: true, changed: true };
    }
  };
}

/**
 * The output read's own declared `recordOutput.process`, as the merge takes it. A process the framework wrote back into
 * the saved step (`../result-processing/processing.ts`, `withResultProcessing`) carries its stamp: under this same
 * declaration it is this merge as it was saved, read again without the stamp the binding renews; under another
 * instruction, or a revision since amended, it is that declaration's product, and keeping it would bring back a
 * condition the amendment removed, so it shapes nothing.
 */
function readProcess(read: unknown, declaration: AutomationStudioAnswerFirstProcessingDeclaration): JsonObject | undefined {
  if (!isObject(read)) return undefined;
  if (!Object.hasOwn(read, "declaration")) return read;
  const { declaration: stamp, ...criteria } = read;
  return isObject(stamp) && stamp.source === declaration.source && stamp.revision === declaration.revision ? criteria : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
