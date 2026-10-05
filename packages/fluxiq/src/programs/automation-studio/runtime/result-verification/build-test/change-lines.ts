// What a replayed press changed, as the judge of a build's test is shown it
// (t174-w106, merged with t193 1003 w3 in t264).
//
// **Why.** Live run `run-musp8nz1-dbd3905a` (lane A, Cause 2): the Flow pressed
// Space Grey twice. The test's replay of the first recorded `t941 "Space Grey"
// no longer marked`, of the second `now marked`, and both judges were shown the
// two rows as `replayed` and nothing else: a step that undoes another cannot be
// seen in outcome words. Live run `run-musp4h2f-72e8ed99` (lane B): the towels'
// "+" was replayed, the web domain answered what it changed, and the judge
// answered no for want of the quantity it set.
//
// **What the domain sends.** A replayed step's answer may carry `changed`, the
// lines saying what it changed on the page it stayed on, in the view's own
// line terms (the web domain's `node-run/press-effect/page-changes.ts`), its
// own cap already applied and said as a last `and N more changes`.
//
// **What the judge is sent.** At most `CHANGE_LINES_MAX` lines: the ones
// naming the control the step acted on -- a line quoting one of the step's own
// words -- first; then a text that now reads otherwise (`t932 "2" was "1"`),
// which is where a quantity, a count or a total the step set is said, since a
// "+" or "-" has no word long enough to quote; then the rest in the domain's
// order. How many more there were, the domain's own count included, is
// `changedNotShown`. Each line is cut to `CHANGE_LINE_CHARS`, has any
// locator-shaped run redacted, and is dropped, as withheld, when it is shaped
// like a credential. Which answers carry lines at all, and what else of them is
// sent, is `./observation.ts`'s to decide; it screens the result again.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** The member of a replayed step's answer that says what it changed. The domain writes the same word. */
export const AUTOMATION_STUDIO_BUILD_TEST_CHANGE_LINES_KEY = "changed";

/** The most change lines one answer is sent: the acted control's, then a value's, then the first others. */
const CHANGE_LINES_MAX = 3;

/** The longest change line sent; a view line is far shorter. */
const CHANGE_LINE_CHARS = 160;

/** The domain's own last line when it capped its list (`page-changes.ts`). */
const DOMAIN_MORE = /^and (\d+) more changes?$/u;

/** A text line that now reads otherwise: the domain's `was "<old>"`. */
const READS_OTHERWISE = / was "/u;

/**
 * One answer's recorded change lines (its `changed` member), bounded as above.
 * `words` are the step's own words, as its row's `target` gives them. No
 * `value` when nothing sendable is left.
 */
export function automationStudioBuildTestChangeLines(recorded: JsonValue | undefined, words: readonly string[]): { value?: { changed: string[]; changedNotShown?: number }; withheld: boolean } {
  if (!Array.isArray(recorded)) return { withheld: false };
  let withheld = false;
  let more = 0;
  const lines = recorded.flatMap((line): string[] => {
    if (typeof line !== "string" || !line.trim()) return [];
    const domainMore = DOMAIN_MORE.exec(line.trim());
    if (domainMore) {
      more += Number(domainMore[1]);
      return [];
    }
    const cut = line.trim().slice(0, CHANGE_LINE_CHARS);
    if (screenAutomationStudioLlmEvidence(cut, []).secretShaped) {
      withheld = true;
      return [];
    }
    const kept = automationStudioWithoutLocators(cut);
    if (kept !== cut) withheld = true;
    return [kept];
  });
  if (!lines.length) return { withheld };
  const quoted = words.filter((word) => word.length > 1).map((word) => `"${word}"`);
  const rank = (line: string): number => quoted.some((word) => line.includes(word)) ? 0 : READS_OTHERWISE.test(line) ? 1 : 2;
  const ordered = lines.map((line, at) => ({ line, at, rank: rank(line) })).sort((a, b) => a.rank - b.rank || a.at - b.at).map((entry) => entry.line);
  const shown = ordered.slice(0, CHANGE_LINES_MAX);
  const notShown = ordered.length - shown.length + more;
  return { value: { changed: shown, ...(notShown > 0 ? { changedNotShown: notShown } : {}) }, withheld };
}
