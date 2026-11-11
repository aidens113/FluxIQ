// The dataset a read's rows go to: one per list, the same for every page of it.
//
// A list the model named is that name and the columns it returns. Otherwise it is the tool it ran,
// the way it was asked (its input without the words that only turn the page, or that only say how a
// saved step's replay went), the view of the site it read (its address without its page words,
// `./read-evidence.ts`) and those columns. So a later page has the same identity and its rows add to
// the same dataset (`./list-after-read.ts` says when), and a read asked another way, of another view,
// or returning other columns, has a dataset of its own and is never mixed in. The input is used here
// to tell reads apart and nowhere else: it never supplies a row. Page-turning words are matched by
// name, so a domain that spells them another way makes each page its own dataset, which the result
// rule then takes as the latest read (`./result-dataset.ts`).
//
// **And which saved step a replay is the read of (run-mwb9b59w-aa0784db).** A saved step's replay sends
// the call its step keeps (what the read really ran with, the answer's `draft.ranWith`), plus how the
// replay goes and the record output the saved Flow's assembly derives for the step, which the read the
// model made never had (`runtime/llm/node-tools/replay/replay.ts`). So by name and columns the replay is
// another list: a forward run's re-read of the result's own list replaced it as "a list of its own", and
// with the person's named columns it even returns other columns. `automationStudioAnswerFirstRecordedReadKey`
// is the step both are: the call as its step holds it, without the replay's words, either record output,
// or the page words. The row sink keys each read the model made by it and finds the read a replay
// replays by it (`./row-sink.ts`). It tells reads apart and nothing else.
import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstPageWord } from "./page-word.ts";

/** What a replay of a saved step adds to its call: how it went, never what was asked (`runtime/llm/node-tools/replay/`: the key, the place, what it produced, and a list read on its own page). */
const REPLAY_WORDS: ReadonlySet<string> = new Set(["replay", "from", "produced", "reach"]);
/** Where a call holds the record output its rows are stored under (`./read-evidence.ts` reads it the same way). */
const RECORD_OUTPUT = "recordOutput";

/** A dataset id in the record-set syntax, stable per list. */
export function automationStudioAnswerFirstReadDatasetId(input: { toolId: string; value: JsonValue; columns: readonly string[]; named?: string | undefined; list?: string | undefined; lookUp?: boolean | undefined }): string {
  const columns = [...input.columns].sort();
  const working = input.lookUp ? { lookUp: true } : {};
  const identity = input.named !== undefined
    ? { named: input.named, columns, ...working }
    : { tool: input.toolId, asked: withoutPaging(asAsked(input.value)), columns, ...(input.list !== undefined ? { at: input.list } : {}), ...working };
  const digest = createHash("sha256").update(stableJson(identity)).digest("hex").slice(0, 12);
  const slug = input.toolId.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "read";
  return `read.${slug}.${digest}`;
}

/** The saved step a read is, by the call its step holds (header): the same for the read the model made and every replay of its step. */
export function automationStudioAnswerFirstRecordedReadKey(input: { toolId: string; value: JsonValue }): string {
  const asked = withoutPaging(withoutRecordOutput(asAsked(input.value)));
  return createHash("sha256").update(stableJson({ tool: input.toolId, asked })).digest("hex").slice(0, 24);
}

function asAsked(value: JsonValue): JsonValue {
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !REPLAY_WORDS.has(key)));
}

/** The call without a record output, on it or on its parameters: the model's, the one the step ran with, or the one assembly derived. */
function withoutRecordOutput(value: JsonValue): JsonValue {
  if (!isObject(value)) return value;
  const kept = Object.fromEntries(Object.entries(value).filter(([key]) => key !== RECORD_OUTPUT));
  const parameters = kept.parameters;
  if (isObject(parameters)) kept.parameters = Object.fromEntries(Object.entries(parameters).filter(([key]) => key !== RECORD_OUTPUT));
  return kept;
}

function withoutPaging(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutPaging);
  if (typeof value !== "object" || value === null) return value;
  const kept: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!automationStudioAnswerFirstPageWord(key)) kept[key] = withoutPaging(item);
  }
  return kept;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
