// The page views a judge asked on its own request is shown: the pages the result rests on, as the page text the model
// read (t1067, t1084).
//
// **Why.** The judge's projection (`./summary.ts`) shows each view and each trail entry as the domain's semantic state,
// with the page itself deliberately left out (`captureOmitted`): a stored finding never holds a raw capture, and the
// deciding digest compares completions by what the judge is shown (t1036), which a page read afresh would make differ by
// a scroll line. A judge that continues the decider's conversation reads the pages there. A judge asked on its own
// request has nothing in their place unless it is given them here: `run-mwy3btww-31d32e0d`'s seven standalone re-asks saw
// no page at all (t1067), and `run-mwz29d50-c3a32a9c`'s replay judges, which continue no decider because a replay makes
// no decision, could not see the rating and pickup line the item was chosen by, answered unknown, and a Flow that had
// worked was repaired (t1084).
//
// **What, in order.** Each page as the text the model would read whole: its lines' texts joined by "\n".
// 1. The end view (`endView`), and the after witness where it is another page.
// 2. The before view (`witnesses.before`), where a lasting act ran.
// 3. The page each lasting act was pressed on, this attempt's acts then carried acts, newest first, where the trail holds
//    it, and then the page each step landed on, newest first (`./trail-pages.ts`). Each is named `trail.<n>`, the trail
//    entry that holds it.
// A page whose text an earlier one already showed is not shown again. Core never reads a line's text: texts are compared
// for equality and measured by length.
//
// **Within the page budget.** Page data in one request stays within the page budget, as every decider request's does
// (`../../llm/view-channel/budget.ts`; user, 2026-11-25: "ensure there is a data limit on pages"). The views share it in
// the order above, each whole while it fits; a view that does not fit what is left shows the lines that do, whole and in
// page order, and says how many lines it left out. Nothing is cut silently.
//
// **Beside the summary, never in it.** The views are kept beside the judge's summary (`keep`, `of`), so the deciding
// digest and a continuing judge's first request are as they were. Every judge asked on its own request carries them,
// put last by `shown`: the Flow-less judge that continues no decider (`../flow-less/judge.ts`), the Flow judge, which never
// does (`../verify.ts`), and any ask after an unreadable reply (`../unreadable-asks/note.ts`).
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS, type AutomationStudioLlmPageView } from "../../llm/view-channel/index.ts";
import type { AutomationStudioResultTrailShownStep } from "../contracts/index.ts";
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";
import { automationStudioJudgePageOf } from "./page-of.ts";
import { automationStudioJudgeTrailPages } from "./trail-pages.ts";

/** What the views are told under: Core's words, generic. */
const NOTE = "The page text of each view named here, as the model working on the target read it: one line per element, in page order. endView is the page the work ended on; witnesses.before the page before its first lasting act; trail.<n> the page trail entry n answered with: the page a lasting act was pressed on, or a page a step landed on. It is evidence, as the rows and the trail are. Where a view says linesNotShown, that many of its lines did not fit this request's page budget and are not shown.";

export class AutomationStudioJudgePageViews {
  private static readonly kept = new WeakMap<object, JsonObject>();

  /**
   * The page views of `views` (the summary's `endView`, `witnesses` and the trail's entries, as held), within the page
   * budget and screened as every value the judge is sent is (header); `undefined` where none holds a page. `before`: a
   * lasting act ran, so the before view is one the judge needs.
   */
  static read(views: { endView?: JsonValue | undefined; witnesses?: JsonValue | undefined; trail?: readonly AutomationStudioResultTrailShownStep[] | undefined }, before: boolean, deniedKeys: readonly string[], budgetChars: number = AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS): JsonObject | undefined {
    const witnesses = object(views.witnesses);
    const named: [string, AutomationStudioLlmPageView | undefined][] = [
      ["endView", automationStudioJudgePageOf(views.endView)],
      ["witnesses.after", automationStudioJudgePageOf(witnesses?.after)],
      ...(before ? [["witnesses.before", automationStudioJudgePageOf(witnesses?.before)] as [string, AutomationStudioLlmPageView | undefined]] : []),
      ...automationStudioJudgeTrailPages(views.trail).map((each) => [each.name, each.page] as [string, AutomationStudioLlmPageView])
    ];
    let left = budgetChars;
    const shown: JsonObject = {};
    const texts = new Set<string>();
    for (const [name, page] of named) {
      if (page === undefined) continue;
      const lines = page.lines.map((line) => line.text);
      const whole = lines.join("\n");
      if (texts.has(whole)) continue;
      texts.add(whole);
      const fit = fitting(lines, left);
      left -= fit.size;
      shown[name] = { text: lines.slice(0, fit.lines).join("\n"), ...(fit.lines < lines.length ? { linesNotShown: lines.length - fit.lines } : {}) };
    }
    if (!Object.keys(shown).length) return undefined;
    const screened = automationStudioResultEvidenceScreen({ note: NOTE, ...shown }, deniedKeys);
    return screened.withheld ? { ...screened.value, withheld: true } : screened.value;
  }

  /** Keep `views` beside `summary`, and beside its trail, which a copy of the summary (a re-ask's notice) still holds. */
  static keep(summary: object, views: JsonObject | undefined): void {
    if (views === undefined) return;
    this.kept.set(summary, views);
    const trail = trailOf(summary);
    if (trail !== undefined) this.kept.set(trail, views);
  }

  /** The page views kept beside `summary`, or beside the trail a copy of it holds. */
  static of(summary: object): JsonObject | undefined {
    const trail = trailOf(summary);
    return this.kept.get(summary) ?? (trail === undefined ? undefined : this.kept.get(trail));
  }

  /**
   * `summary` as a judge on its own request is sent it: `views` last, as `pageViews`, in place of any it held, and kept
   * beside the copy (header). `summary` itself where there are none.
   */
  static shown<TSummary extends object>(summary: TSummary, views: JsonObject | undefined): TSummary {
    if (views === undefined) return summary;
    const { pageViews: _earlier, ...rest } = summary as TSummary & { pageViews?: unknown };
    const sent = { ...rest, pageViews: views } as unknown as TSummary;
    this.keep(sent, views);
    return sent;
  }
}

/** How many of `lines` fit `left` characters whole, in order, and their size joined by "\n". */
function fitting(lines: readonly string[], left: number): { lines: number; size: number } {
  let fit = 0;
  let size = 0;
  for (const line of lines) {
    const added = (fit ? 1 : 0) + line.length;
    if (size + added > left) break;
    size += added;
    fit += 1;
  }
  return { lines: fit, size };
}

function trailOf(summary: object): object | undefined {
  const trail = (summary as { trail?: unknown }).trail;
  return typeof trail === "object" && trail !== null ? trail : undefined;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
