// Which trail pages a judge on its own request is shown, and in what order (t1084): the page each lasting act was pressed
// on, newest first, then the page each step landed on, newest first; and how they share the page budget after the end
// and before views (`../page-views.ts`). The site is a kind no realistic scenario uses (a garden centre). No model call.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailShownStep } from "../../contracts/index.ts";
import { automationStudioResultTrailRepeatsOnce } from "../../run-trail/index.ts";
import { AutomationStudioJudgePageViews } from "../index.ts";
import { automationStudioJudgeTrailPages } from "../trail-pages.ts";

const page = (key: string, texts: readonly string[]): JsonObject => ({ key, lines: texts.map((text, at) => ({ key: `k${at}`, text })) });
const SEARCH = page("https://garden.test/search", ['PAGE "Seed trays"', 't5 "Seed Tray, 24 Cells"', 't6 "4.5 out of 5"']);
const ITEM = page("https://garden.test/item/24", ['PAGE "Seed Tray, 24 Cells"', 't9 "Collect today"', 't10 button "+ Add"']);
const BASKET = page("https://garden.test/basket", ['PAGE "Basket"', 't20 "Seed Tray, 24 Cells"']);

/** A replay's step as the Flow's run records it: the page it landed on under `found.view`. */
const landed = (n: number, view: JsonObject | undefined, framework: JsonObject = {}): AutomationStudioResultTrailShownStep => ({ n, did: "garden.press", ...(view === undefined ? {} : { found: { view: { pageView: view } } }), framework });
/** A decider's call as the chain records it: the domain's answer, its page under `pageView`. */
const called = (n: number, view: JsonObject, framework: JsonObject = {}): AutomationStudioResultTrailShownStep => ({ n, callId: `c${n}`, did: "garden.press", found: { pageView: view }, framework });
const ADDED = { consequences: ["modify_existing"], effectApplied: true };
const PASSED_AS_DONE = { consequences: ["modify_existing"], skipped: { reason: "already_done" } };

describe("the trail's pages, in the order a judge is shown them", () => {
  it("puts the page each lasting act was pressed on first, newest first, then every page landed on, newest first", () => {
    const trail = [called(1, SEARCH), called(2, ITEM, ADDED), landed(3, SEARCH), landed(4, ITEM), landed(5, undefined, PASSED_AS_DONE), landed(6, BASKET)];
    // The replay's add, passed over as done, has no page of its own: the page it stood on is the one before it (4).
    // The carried add (2) answered with its own page. Then every page landed on, newest first.
    expect(automationStudioJudgeTrailPages(trail).map((each) => each.name)).toEqual(["trail.4", "trail.2", "trail.1", "trail.6", "trail.3"]);
  });

  it("reads a page that repeats an earlier entry's byte for byte as the page it names", () => {
    const trail = automationStudioResultTrailRepeatsOnce([landed(1, ITEM), landed(2, SEARCH), landed(3, ITEM, ADDED)]);
    expect(trail[2]!.found).toEqual({ view: { sameAs: "n:1" } });
    const pages = automationStudioJudgeTrailPages(trail);
    expect(pages[0]).toEqual({ name: "trail.3", page: ITEM });
  });

  it("is nothing for a trail that holds no page", () => {
    expect(automationStudioJudgeTrailPages([{ n: 1, did: "garden.read", found: { rows: 2 } }])).toEqual([]);
    expect(automationStudioJudgeTrailPages(undefined)).toEqual([]);
  });
});

describe("the trail's pages beside the end and before views", () => {
  it("come after them, a text already shown is not shown again, and they share one budget", () => {
    const trail = [called(1, SEARCH), called(2, ITEM, ADDED), landed(3, BASKET)];
    const shown = AutomationStudioJudgePageViews.read({ endView: { view: { pageView: BASKET } }, witnesses: { before: { pageView: SEARCH }, after: { pageView: BASKET } }, trail }, true, [])!;
    expect(Object.keys(shown)).toEqual(["note", "endView", "witnesses.before", "trail.2"]);
    expect((shown["trail.2"] as JsonObject).text).toBe('PAGE "Seed Tray, 24 Cells"\nt9 "Collect today"\nt10 button "+ Add"');
    const tight = AutomationStudioJudgePageViews.read({ endView: { view: { pageView: BASKET } }, trail }, false, [], 70)!;
    expect(tight["trail.2"]).toEqual({ text: 'PAGE "Seed Tray, 24 Cells"', linesNotShown: 2 });
  });

  it("are screened as every value sent to a judge is", () => {
    const secret = page("https://garden.test/account", ['t1 "api key sk-ant-api03-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"']);
    const shown = AutomationStudioJudgePageViews.read({ trail: [called(1, secret, ADDED)] }, false, [])!;
    expect(JSON.stringify(shown)).not.toContain("sk-ant-api03-0123456789");
  });

  it("are held whatever the run did, a run that only pressed and read included", () => {
    const shown = AutomationStudioJudgePageViews.read({ trail: [landed(1, SEARCH), landed(2, ITEM)] }, false, [])!;
    expect(Object.keys(shown)).toEqual(["note", "trail.2", "trail.1"]);
  });
});
