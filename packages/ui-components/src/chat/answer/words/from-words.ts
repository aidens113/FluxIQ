// Where the answer came from and what it took: "From: 3 results pages on shop.example · 3m 14s · $1.12".

import type { ChatTaskAttemptFields, ChatTaskResult } from "../../ports/index.ts";
import { costWords, timeWords } from "./spend-words.ts";

/** The provenance line; none when there is neither a page, a time nor a cost to say. */
export function fromWords(attempt: ChatTaskAttemptFields, result: ChatTaskResult | undefined, reportsSpend: boolean): string | undefined {
  const pages = (result?.from ?? []).map((from) => `${from.pages} on ${from.site}`).join("; ");
  const parts = [timeWords(attempt), costWords(attempt, reportsSpend)].filter((part): part is string => part !== undefined);
  if (pages === "") return parts.length === 0 ? undefined : `Took ${parts.join(" · ")}`;
  return `From: ${[pages, ...parts].join(" · ")}`;
}
