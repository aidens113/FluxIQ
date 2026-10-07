// What the observer knows about a call beyond the call itself, gathered from
// what the loop showed it before (`./observer.ts`):
//
// - **Where the work starts.** A page served from this machine read "the start
//   page" wherever it was: run D's build opened `/friends/` as "Opening the
//   start page" (U10, `run-muw6144a-e56f945d`). The start is what Core itself
//   says it is: the address Core's opening call goes to, the address a test of
//   the Flow puts the page back to before its first step (`replay: "reset"`,
//   `from.location`), and the address the draft's first step opens.
// - **Which row a pass of a repeat is on.** A test runs a repeated step once
//   per row of the list before it (`../llm/node-tools/replay-span.ts`), and
//   its three passes over Amara, Jonas and Lin read as three identical
//   "Testing: Click · Confirm" cards (U1). A pass's call carries its row under
//   `item`; the row's name is its value under the column the list read named
//   its rows by (`readRows.rows`, one cell per row: the domain's own label,
//   already screened of denied columns). Nothing is named when no read named
//   its rows, or the row has no such value.
// - **How many rows a read kept.** A test's list read answers its rows as the
//   node's array output (`outputs`), or names them (`readRows`): "Read list ·
//   Done" said nothing of a read the chat claimed covered every page (U-1,
//   `run-muw60j7c-bb7c9a62`). A build's own list read sends neither, but its
//   evidence says what it kept (`read.extraction.recordCount`, and
//   `pagesRead`): its card read a bare "Read list · Done" while the read said
//   "20 records from 1 page" (F2, live-C round 3, `run-mux6naez-6c20f26e`),
//   so that count, and its pages, are read when the answer gives no rows.
// - **What the page calls a list a detection found.** A detection's answer
//   names the list when the page does -- a heading or an accessible name, as
//   `list` on its evidence (the web domain's `structure/list-name.ts`) -- so its
//   card says "Look · the “Search results” list" rather than "the repeating
//   list on the page" (R2-U-9, `run-muwansvz-a2b4a987`). Read by shape, kept
//   only as a short plain label.
//
// Reads only: a call and its result pass through the observer unchanged.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioActivityHumanLabel } from "./wording/index.ts";

type Call = { callId: string; toolId: string; value?: unknown };
type Evidence = ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;

/** The draft's entry the model is shown (`../flow-draft/entry.ts`), read as a plain string so this module does not reach into the draft. */
const DRAFT_ENTRY = "core.flow_draft";
/** The prefix of Core's own call before the first decision (`../llm/evidence-loop.ts`), and of a test's calls (`../llm/node-tools/replay-draft.ts`). */
const OPENING_PREFIX = "initial.";
const DRY_RUN_PREFIX = "dryrun.";
/** The call id a pass of a repeat is sent under, `<step>.pass.<n>` (`../llm/node-tools/replay-span.ts`). */
const PASS = /\.pass\.\d+$/u;
/** The member a replayed read names its rows in, as the domain writes it (`../result-verification/build-test/read-rows.ts`). */
const READ_ROWS = "readRows";
/** The most of a row's name a title carries. */
const MAX_ROW_NAME = 40;
/** The member a detection's answer names its list in, as the domain writes it (the web domain's `structure/packet.ts`). */
const LIST = "list";
/** The most of a list's name a title carries. */
const MAX_LIST_NAME = 60;

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);
const address = (value: unknown): string | undefined => (typeof value === "string" && /^https?:\/\//iu.test(value.trim()) ? value.trim() : undefined);

/** The address a navigate call opens: a node's `url` parameter, when the node it runs is a navigate. */
function opens(value: Record<string, unknown> | undefined, actionId?: unknown): string | undefined {
  const node = typeof actionId === "string" ? actionId : value?.node;
  if (typeof node !== "string" || !/navigate/iu.test(node)) return undefined;
  return address(record(value?.parameters)?.url);
}

/** The address the draft's first step opens, from the draft's entry, when it is a navigate. */
function draftStart(evidence: Evidence): string | undefined {
  const entry = evidence.find((candidate) => candidate.callId === DRAFT_ENTRY && candidate.toolId === DRAFT_ENTRY);
  const steps = record(entry?.value)?.steps;
  const first = Array.isArray(steps) ? steps.map(record).find((step) => step?.step === 1) : undefined;
  return first ? opens(record(first.input), first.actionId) : undefined;
}

/** The rows a call's answer kept: its first array output of records, else the rows its read named, else the count its read's extraction gives. */
function rowsOf(result: unknown): number | undefined {
  const answer = record(result);
  const outputs = record(answer?.outputs);
  for (const value of Object.values(outputs ?? {})) {
    if (Array.isArray(value) && value.every((row) => record(row) !== undefined)) return value.length;
  }
  const named = record(record(answer?.evidence)?.[READ_ROWS]);
  if (!Array.isArray(named?.rows)) return extractionCount(result, "recordCount");
  const more = typeof named.rowsNotShown === "number" && Number.isSafeInteger(named.rowsNotShown) && named.rowsNotShown > 0 ? named.rowsNotShown : 0;
  return named.rows.length + more;
}

/** The member of a list read's evidence that says what it kept (the web domain's `read.extraction`). */
const READ = "read";
const EXTRACTION = "extraction";

/** A count a list read's extraction gives (`recordCount`, `pagesRead`), when it is a whole number. */
function extractionCount(result: unknown, key: "recordCount" | "pagesRead"): number | undefined {
  const value = record(record(record(record(result)?.evidence)?.[READ])?.[EXTRACTION])?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** The page's own name for the list a call's answer found (`evidence.list`), as a short plain label. */
function listOf(result: unknown): string | undefined {
  return automationStudioActivityHumanLabel(record(record(result)?.evidence)?.[LIST], MAX_LIST_NAME);
}

/** The column a read named its rows by: the one cell of its first row. */
function labelColumn(result: unknown): string | undefined {
  const rows = record(record(record(result)?.evidence)?.[READ_ROWS])?.rows;
  const first = Array.isArray(rows) ? record(rows[0]) : undefined;
  const keys = first ? Object.keys(first) : [];
  return keys.length === 1 ? keys[0] : undefined;
}

/**
 * The observer's memory of one round: `decided` with each decision's evidence,
 * `sent` before a call goes out (it answers what the call's words need), and
 * `answered` with its result (it answers the rows it kept).
 */
export function automationStudioActivityCallContext(): {
  decided(evidence: Evidence): void;
  sent(call: Call): { start?: string; row?: string };
  answered(call: Call, result: unknown): { rows?: number; pages?: number; list?: string };
  /** The address the work starts at, where it is known yet. */
  start(): string | undefined;
} {
  let start: string | undefined;
  let column: string | undefined;
  return {
    decided: (evidence) => { start = draftStart(evidence) ?? start; },
    sent: (call) => {
      const value = record(call.value);
      if (call.callId.startsWith(OPENING_PREFIX)) start = opens(value) ?? start;
      else if (call.callId.startsWith(DRY_RUN_PREFIX) && value?.replay === "reset") start = address(record(value.from)?.location) ?? start;
      const cell = PASS.test(call.callId) && column !== undefined ? record(value?.item)?.[column] : undefined;
      const row = typeof cell === "string" ? automationStudioActivityHumanLabel(cell.replace(/[“”]/gu, ""), MAX_ROW_NAME) : undefined;
      return { ...(start !== undefined ? { start } : {}), ...(row !== undefined ? { row } : {}) };
    },
    answered: (call, result) => {
      // A read inside a pass names the pass's rows, never the list the repeat walks.
      if (!PASS.test(call.callId)) column = labelColumn(result) ?? column;
      const rows = rowsOf(result);
      // Pages only beside rows, and only as the read's own extraction counted them.
      const pages = rows === undefined ? undefined : extractionCount(result, "pagesRead");
      const list = listOf(result);
      return { ...(rows !== undefined ? { rows } : {}), ...(pages !== undefined ? { pages } : {}), ...(list !== undefined ? { list } : {}) };
    },
    start: () => start
  };
}
