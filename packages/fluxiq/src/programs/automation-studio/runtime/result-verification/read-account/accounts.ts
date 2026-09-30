// How each list read of a run went, joined from the read's own account of
// itself and the parameters the Flow authored the step with.
//
// **The counts are already on the run record.** A read answers with a summary
// of itself -- pages read, why paging stopped, items seen, rows kept, what each
// `where` condition rejected -- and `service/summaries/extraction-summary.ts`
// admits it member by member onto the attempt as `metadata.extraction`. It is
// re-read here only for the members this account carries, each held to the
// type that module already enforced, so a record written before a member
// existed simply lacks it.
//
// **The rest is what the step was authored with.** Whether it pages, how many
// pages it may read, whether it keeps one row per key and which, and each
// condition in the model's own words (`condition.ts`). The read's parameters sit
// either at the top of the step's parameters or one object down, under the key
// the domain's definition gives them; that key is the domain's to name, so it is
// found by what the object holds -- a condition list, a paging setting, a dedupe
// setting, a column map -- rather than by its name.
//
// A condition is paired with its rejection count by position: the read reports
// one count per condition it was given, in the order it was given them.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { automationStudioEvidenceKey } from "../../llm/index.ts";
import type { AutomationStudioResultReadAccount } from "../contracts.ts";
import { automationStudioResultReadConditionText } from "./condition.ts";

/** Reads accounted for. A run with more says so through the summary's `withheld`. */
const MAX_READS = 4;
/** Conditions accounted for per read. */
const MAX_CONDITIONS = 8;
/** Dedupe keys named per read. */
const MAX_DEDUPE_KEYS = 6;
/** The members that mark an object as a read's own parameters. */
const READ_PARAMETER_KEYS = ["where", "paginate", "dedupe", "fields"];
/** A closed word the read reports, as extraction-summary.ts admits them. */
const STOP_WORD = /^[a-z_]{1,40}$/u;

export type AutomationStudioResultReadAccountsInput = {
  /** The run's recorded attempts, in the order they ran. */
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  /** The Flow's authored nodes, for what each read step was authored with. */
  flowNodes?: readonly AutomationStudioFlowNode[] | undefined;
  /** The bound domain's declared keys. Absent, nothing authored is carried: only counts. */
  deniedEvidenceKeys?: readonly string[] | undefined;
};

/** One account per step that reported a read, in the order each first read, at most `MAX_READS`, plus whether any were left out. */
export function automationStudioResultReadAccounts(input: AutomationStudioResultReadAccountsInput): { reads: AutomationStudioResultReadAccount[]; withheld: boolean } {
  const latest = new Map<string, { attempt: AutomationStudioFlowRunActionAttemptRecord; extraction: JsonObject; attempts: number }>();
  for (const attempt of input.actionAttempts ?? []) {
    const extraction = attempt.metadata?.extraction;
    if (!isRecord(extraction) || count(extraction.recordCount) === undefined || count(extraction.pagesRead) === undefined) continue;
    const previous = latest.get(attempt.nodeId);
    const attempts = (previous?.attempts ?? 0) + 1;
    // The last read that succeeded speaks for the step; a failed one only until a later one succeeds.
    const replaces = !previous || attempt.status === "succeeded" || previous.attempt.status !== "succeeded";
    latest.set(attempt.nodeId, replaces ? { attempt, extraction, attempts } : { ...previous, attempts });
  }
  const nodes = new Map((input.flowNodes ?? []).map((node) => [node.id, node]));
  const reads = [...latest.values()].slice(0, MAX_READS).map(({ attempt, extraction, attempts }) =>
    account(attempt, extraction, attempts, nodes.get(attempt.nodeId), input.deniedEvidenceKeys));
  return { reads, withheld: latest.size > reads.length };
}

function account(
  attempt: AutomationStudioFlowRunActionAttemptRecord,
  extraction: JsonObject,
  attempts: number,
  node: AutomationStudioFlowNode | undefined,
  deniedKeys: readonly string[] | undefined
): AutomationStudioResultReadAccount {
  const authored = node && deniedKeys ? readParameters(node.parameterValues) : undefined;
  const stop = typeof extraction.paginationStop === "string" && STOP_WORD.test(extraction.paginationStop) ? extraction.paginationStop : undefined;
  const itemsSeen = count(extraction.itemsSeen);
  const filter = isRecord(extraction.conditions) ? extraction.conditions : undefined;
  const conditions = conditionAccounts(filter, authored, deniedKeys);
  const paginate = authored?.paginate;
  const pageLimit = isRecord(paginate) ? firstLimit(paginate) : undefined;
  const dedupe = authored?.dedupe;
  const dedupeBy = isRecord(dedupe) && deniedKeys ? columnKeys(dedupe.by, deniedKeys) : [];
  return {
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    pagesRead: count(extraction.pagesRead) ?? 0,
    ...(pageLimit !== undefined ? { pageLimit } : {}),
    ...(stop ? { stop } : {}),
    truncated: extraction.truncated === true,
    ...(itemsSeen !== undefined ? { itemsSeen } : {}),
    kept: count(extraction.recordCount) ?? 0,
    ...(authored ? { paginates: isRecord(paginate), dedupes: isRecord(dedupe) || dedupe === true } : {}),
    ...(dedupeBy.length ? { dedupeBy } : {}),
    ...(conditions.length ? { conditions } : {}),
    ...(filter?.unfiltered === true ? { unfiltered: true } : {}),
    ...(attempts > 1 ? { attempts } : {})
  };
}

/**
 * Each condition with the rows it rejected: as many as the read counted or the
 * step authored, whichever is more, so a count with no wording and a wording
 * with no count are both still said.
 */
function conditionAccounts(
  filter: JsonObject | undefined,
  authored: JsonObject | undefined,
  deniedKeys: readonly string[] | undefined
): NonNullable<AutomationStudioResultReadAccount["conditions"]> {
  const rejected = Array.isArray(filter?.rejected) ? filter.rejected : [];
  // What each condition's own read found, positionally like the counts; `condition.ts` decides whether it may be said.
  const seen = Array.isArray(filter?.seen) ? filter.seen : [];
  const written = Array.isArray(authored?.where) ? authored.where : [];
  const columns = isRecord(authored?.fields) ? authored.fields : undefined;
  const total = Math.min(MAX_CONDITIONS, Math.max(rejected.length, written.length));
  const accounts: NonNullable<AutomationStudioResultReadAccount["conditions"]> = [];
  for (let index = 0; index < total; index += 1) {
    const condition = deniedKeys ? automationStudioResultReadConditionText(written[index], columns, deniedKeys, seen[index]) : undefined;
    const rows = count(rejected[index]);
    accounts.push({ ...(condition ? { condition } : {}), ...(rows !== undefined ? { rejected: rows } : {}) });
  }
  return accounts;
}

/** The read's own parameters: the step's, or the one object inside them that holds what a read is authored with. */
function readParameters(parameters: JsonObject | undefined): JsonObject | undefined {
  if (!parameters) return undefined;
  const candidates = [parameters, ...Object.values(parameters).filter(isRecord)];
  return candidates.find((candidate) => READ_PARAMETER_KEYS.some((key) => Object.hasOwn(candidate, key)));
}

/** The first bound a paging setting states (`maxPages`, or its equivalent for a mode that loads rather than turns pages). */
function firstLimit(paginate: JsonObject): number | undefined {
  for (const [key, value] of Object.entries(paginate)) if (/^max/u.test(key) && count(value) !== undefined) return value as number;
  return undefined;
}

/** Column ids, held to the stored schema's own id rule and the domain's declared keys. */
function columnKeys(value: JsonValue | undefined, deniedKeys: readonly string[]): string[] {
  const written = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  return written
    .filter((key): key is string => typeof key === "string" && AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(key) && !denied.has(automationStudioEvidenceKey(key)))
    .slice(0, MAX_DEDUPE_KEYS);
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
