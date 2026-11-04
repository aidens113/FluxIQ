// What the task did on the site, from its acts: "nothing changed" only when the record
// holds none.

import type { ChatAttemptAct } from "../../ports/index.ts";
import { actWords } from "./act-words.ts";

/** The title and one line per act; no acts is "nothing changed". */
export function siteWords(acts: readonly ChatAttemptAct[]): { title: string; lines: string[] } {
  if (acts.length === 0) return { title: "On the site: nothing changed", lines: [] };
  return { title: "On the site", lines: acts.map(actWords) };
}
