// The page views a judge asked on its own request is shown: the end view, and the before view where a lasting act ran,
// as the page text the decider read (t1067).
//
// **Why.** The judge's projection (`./summary.ts`) shows each view as the domain's semantic state, with the page itself
// deliberately left out (`captureOmitted`): a stored finding never holds a raw capture, and the deciding digest compares
// completions by what the judge is shown (t1036), which a page read afresh would make differ by a scroll line. A judge
// that continues the decider's conversation reads the page there. A judge asked on its own request after an unreadable
// reply (`../unreadable-asks/`, t979) had nothing in its place: `run-mwy3btww-31d32e0d`'s seven standalone judges saw no
// page at all, and asked for what the page showed.
//
// **What.** Each view's page, found by its shape alone (`../../llm/view-channel/view-of.ts`: a page key and keyed lines,
// whatever member the domain puts it under), as the text the model would read whole: its lines' texts joined by "\n".
// The end view first, then the before view where a lasting act ran, then the after witness where it is not the end view
// again. Core never reads a line's text.
//
// **Within the page budget.** Page data in one request stays within the page budget, as every decider request's does
// (`../../llm/view-channel/budget.ts`; user, 2026-11-25: "ensure there is a data limit on pages"). The views share it in
// the order above, each whole while it fits; a view that does not fit what is left shows the lines that do, whole and in
// page order, and says how many lines it left out. Nothing is cut silently.
//
// **Shown only where the decider's page is not.** The views are kept beside the judge's summary, never in it (`keep`,
// `of`), and an ask after an unreadable reply, which is always asked on its own request, puts them in
// (`../unreadable-asks/note.ts`). So the deciding digest and a continuing judge's request are as they were. They are
// kept beside the summary's trail too, which a copy of the summary (a re-ask's notice) still holds.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS, automationStudioLlmPageViewOf, type AutomationStudioLlmPageView } from "../../llm/view-channel/index.ts";
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";

/** What the views are told under: Core's words, generic. */
const NOTE = "The page text of each view named here, as the model working on the target read it: one line per element, in page order. It is evidence, as the rows and the trail are. Where a view says linesNotShown, that many of its lines did not fit this request's page budget and are not shown.";
/** How deep a view's members are searched for its page: the view, its wrapper (`view`), and a reading held inside a note. */
const MOST_DEPTH = 3;

export class AutomationStudioJudgePageViews {
  private static readonly kept = new WeakMap<object, JsonObject>();

  /**
   * The page views of `views` (the summary's `endView` and `witnesses`, as held), within the page budget and screened as
   * every value the judge is sent is (header); `undefined` where no view holds a page. `before`: a lasting act ran, so
   * the before view is one the judge needs.
   */
  static read(views: { endView?: JsonValue | undefined; witnesses?: JsonValue | undefined }, before: boolean, deniedKeys: readonly string[], budgetChars: number = AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS): JsonObject | undefined {
    const witnesses = object(views.witnesses);
    const named: [string, JsonValue | undefined][] = [["endView", views.endView], ...(before ? [["witnesses.before", witnesses?.before] as [string, JsonValue | undefined]] : []), ["witnesses.after", witnesses?.after]];
    let left = budgetChars;
    const shown: JsonObject = {};
    const texts: string[] = [];
    for (const [name, view] of named) {
      const page = pageOf(view);
      if (page === undefined) continue;
      const lines = page.lines.map((line) => line.text);
      const whole = lines.join("\n");
      if (texts.includes(whole)) continue;
      texts.push(whole);
      let fit = 0;
      let size = 0;
      for (const line of lines) {
        const added = (fit ? 1 : 0) + line.length;
        if (size + added > left) break;
        size += added;
        fit += 1;
      }
      left -= size;
      shown[name] = { text: lines.slice(0, fit).join("\n"), ...(fit < lines.length ? { linesNotShown: lines.length - fit } : {}) };
    }
    if (!Object.keys(shown).length) return undefined;
    const screened = automationStudioResultEvidenceScreen({ note: NOTE, ...shown }, deniedKeys);
    return screened.withheld ? { ...screened.value, withheld: true } : screened.value;
  }

  /** Keep `views` beside `summary`, and beside its trail (header). */
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
}

/** The page a view holds, found by its shape among its members (header). */
function pageOf(value: JsonValue | undefined): AutomationStudioLlmPageView | undefined {
  let level: JsonValue[] = value === undefined ? [] : [value];
  for (let depth = 0; depth <= MOST_DEPTH && level.length; depth += 1) {
    const next: JsonValue[] = [];
    for (const each of level) {
      const page = automationStudioLlmPageViewOf(each);
      if (page !== undefined) return page;
      const held = object(each);
      if (held) next.push(...Object.values(held).filter((member) => object(member) !== undefined));
    }
    level = next;
  }
  return undefined;
}

function trailOf(summary: object): object | undefined {
  const trail = (summary as { trail?: unknown }).trail;
  return typeof trail === "object" && trail !== null ? trail : undefined;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
