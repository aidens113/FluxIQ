// What the task did on the site, from its acts. A result's acts are the ones the record declared, so an
// undeclared press that changed the site is not in them by design: with none, this says what the record
// holds ("I recorded no changes") and never that the site was left alone.

import type { ChatAttemptAct } from "../../ports/index.ts";
import { actWords } from "./act-words.ts";

/** The title and one line per act; no acts is "I recorded no changes". */
export function siteWords(acts: readonly ChatAttemptAct[]): { title: string; lines: string[] } {
  if (acts.length === 0) return { title: "On the site: I recorded no changes", lines: [] };
  return { title: "On the site", lines: acts.map(actWords) };
}
