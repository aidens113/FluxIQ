// The dataset a read's rows go to, the same for every page of the same read.
//
// A read is the tool it ran, the way it was asked (its input without the
// words that only turn the page) and the columns it returns. A later page of
// it has the same identity, so its rows add to the same dataset; a read asked
// another way, or returning other columns, has a dataset of its own. The
// input is used here to tell reads apart and nowhere else: it never supplies
// a row. Page-turning words are matched by name, so a domain that spells them
// another way makes each page its own dataset, which the result rule then
// takes as the latest read (`../result-dataset.ts`).
import { createHash } from "node:crypto";
import type { JsonValue } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";

const PAGE_WORDS: ReadonlySet<string> = new Set([
  "page", "pagenumber", "pageindex", "pagenum", "pageno", "nextpage", "offset", "startindex", "skip", "cursor", "after", "limit", "pagesize", "perpage", "scroll", "scrollby"
]);

/** A dataset id in the record-set syntax, stable per read. */
export function automationStudioAnswerFirstReadDatasetId(input: { toolId: string; value: JsonValue; columns: readonly string[] }): string {
  const digest = createHash("sha256").update(stableJson({ tool: input.toolId, asked: withoutPaging(input.value), columns: [...input.columns].sort() })).digest("hex").slice(0, 12);
  const slug = input.toolId.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "read";
  return `read.${slug}.${digest}`;
}

function withoutPaging(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutPaging);
  if (typeof value !== "object" || value === null) return value;
  const kept: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!PAGE_WORDS.has(key.toLowerCase().replace(/[^a-z0-9]+/gu, ""))) kept[key] = withoutPaging(item);
  }
  return kept;
}
