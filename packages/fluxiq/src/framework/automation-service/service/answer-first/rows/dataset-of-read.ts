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
import { createHash } from "node:crypto";
import type { JsonValue } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";
import { automationStudioAnswerFirstPageWord } from "./page-word.ts";

/** What a replay of a saved step adds to its call: how it went, never what was asked. */
const REPLAY_WORDS: ReadonlySet<string> = new Set(["replay", "from", "produced"]);

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

function asAsked(value: JsonValue): JsonValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !REPLAY_WORDS.has(key)));
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
