// The page channel's projection (page-diff D1, D3, D6, D7; t1080): each result's
// page delivered whole the first time the window meets its key, as git-style
// changes after, in parts past the budget; each result keeps a fixed note of its
// delivery, the deliveries sit in one trailing `core.page_window` entry, and no
// later record ever changes how an earlier one reads.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../../evidence-recall/index.ts";
import {
  AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID,
  AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS,
  AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID,
  automationStudioLlmPageChannelProjection,
  type AutomationStudioLlmPageChannel,
  type AutomationStudioLlmPageLine
} from "../index.ts";

type Entry = { callId: string; toolId: string; value: JsonValue };
const channel = { member: "pageView" };
const W = AUTOMATION_STUDIO_LLM_PAGE_WINDOW_TOOL_ID;

const lines = (...texts: string[]): AutomationStudioLlmPageLine[] => texts.map((text) => ({ key: text.split(" ")[0]!, text }));
const result = (callId: string, key: string, view: AutomationStudioLlmPageLine[], extra: JsonObject = {}): Entry =>
  ({ callId, toolId: "web.act", value: { ok: true, ...extra, pageView: { key, lines: view } } });
const project = (records: readonly Entry[], ch: AutomationStudioLlmPageChannel = channel) => automationStudioLlmPageChannelProjection(records, ch);
const noteOf = (entry: Entry): JsonObject => (entry.value as JsonObject).pageView as JsonObject;
const pagesOf = (window: Entry | undefined): JsonObject[] => (window ? ((window.value as JsonObject).pages as JsonObject[]) : []);
const heldOf = (window: Entry | undefined, key: string): JsonObject[] | undefined => pagesOf(window).find((page) => page.key === key)?.shown as JsonObject[] | undefined;
const textOf = (view: AutomationStudioLlmPageLine[]): string => view.map((line) => line.text).join("\n");

const padding = ["p1 text \"Padding one\"", "p2 text \"Padding two\"", "p3 text \"Padding three\"", "p4 text \"Padding four\""];
const home = lines("PAGE \"Home\"", "t1 link \"One\"", "t2 button \"Two\"", "t3 field \"Three\"", ...padding);

describe("the page channel", () => {
  it("delivers a page whole the first time the window meets its key, and the result keeps a short note of it, every other property where it was", () => {
    const { history, window } = project([result("c1", "~/", home, { did: "pressed" })]);
    expect(Object.keys(history[0]!.value as JsonObject)).toEqual(["ok", "did", "pageView"]);
    expect(noteOf(history[0]!)).toEqual({ key: "~/", shown: "whole", in: W });
    expect(window).toEqual({ callId: W, toolId: W, value: { pages: [{ key: "~/", current: true, shown: [{ call: "c1", whole: textOf(home) }] }] } });
  });

  it("delivers a later view of the same key as git-style changes since the last one delivered, and a first meeting of another key whole", () => {
    const changed = lines("PAGE \"Home\"", "t1 link \"One\"", "t2 button \"Two (2)\"", "t4 link \"Four\"", ...padding);
    const { history, window } = project([result("c1", "~/", home), result("c2", "~/", changed), result("c3", "~/cart", lines("PAGE \"Cart\"")), result("c4", "~/", changed)]);
    expect(noteOf(history[1]!)).toEqual({ key: "~/", shown: "changes", since: "c1", in: W });
    expect(noteOf(history[2]!)).toEqual({ key: "~/cart", shown: "whole", in: W });
    // Unchanged since the last one delivered of that key: told in the result, nothing in the window.
    expect(noteOf(history[3]!)).toEqual({ key: "~/", since: "c2", unchanged: true });
    expect((window!.value as JsonObject).read).toContain("\"- \" left");
    // The page the work is on comes last.
    expect(pagesOf(window).map((page) => [page.key, page.current])).toEqual([["~/cart", undefined], ["~/", true]]);
    expect(heldOf(window, "~/")).toEqual([
      { call: "c1", whole: textOf(home) },
      { call: "c2", since: "c1", changes: ["  t1 link \"One\"", "~ t2 button \"Two (2)\"", "- t3 field \"Three\"", "+ t4 link \"Four\""].join("\n") }
    ]);
    expect(heldOf(window, "~/cart")).toEqual([{ call: "c3", whole: "PAGE \"Cart\"" }]);
  });

  it("shows lines marked extra in their own delivery and never compares a later view with them", () => {
    const captured = [...home, { key: "t9", text: "t9 hidden input \"code\"", extra: true as const }];
    const { history, window } = project([
      { callId: "f1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { pageView: { key: "~/", lines: captured } } },
      result("c2", "~/", home)
    ]);
    expect(heldOf(window, "~/")).toEqual([{ call: "f1", whole: textOf(captured) }]);
    expect(noteOf(history[1]!)).toEqual({ key: "~/", since: "f1", unchanged: true });
  });

  it("sends a delivery past the budget in parts, saying how many lines are left and how to ask, and answers a part request from it", () => {
    const long = Array.from({ length: 30 }, (_, index) => ({ key: `t${index}`, text: `t${index} ${"w".repeat(18)}` }));
    const small = { member: "pageView", budgetChars: 230 };
    const records: Entry[] = [
      result("c1", "~/", long),
      { callId: "p2", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 2 } },
      { callId: "p9", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 9 } }
    ];
    const { history, window } = project(records, small);
    const first = heldOf(project(records.slice(0, 1), small).window, "~/")![0]!;
    expect(first.part).toBe("1 of 3");
    expect((first.whole as string).length).toBeLessThanOrEqual(230);
    expect(first.rest).toBe(`Page text past the budget of 230 characters: 20 more lines in parts 2 to 3. Call ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} with part 2 for the next.`);
    // Part 2 and part 1 together would pass the budget, so part 1 leaves the window once part 2 is read; the results read as they did.
    expect(noteOf(history[0]!)).toEqual({ key: "~/", shown: "whole", in: W });
    expect(noteOf(history[1]!)).toEqual({ key: "~/", from: "c1", shown: "part 2 of 3", in: W });
    expect((history[1]!.value as JsonObject).part).toBe(2);
    const second = heldOf(window, "~/")!;
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ call: "p2", from: "c1", part: "2 of 3" });
    expect((second[0]!.whole as string).split("\n")[0]).toBe(long[10]!.text);
    // A part that does not exist is answered, never an ending.
    expect(noteOf(history[2]!)).toEqual({ key: "~/", missing: "There is no part 9: the delivery in call c1 has 3 parts." });
    // Every line is in exactly one part, in page order.
    const third = heldOf(project([records[0]!, { callId: "p3", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 3 } }], small).window, "~/")!.at(-1)!;
    expect([first.whole, second[0]!.whole, third.whole].join("\n")).toBe(textOf(long));
    expect(third.rest).toBeUndefined();
  });

  it("answers a part request with no delivery in parts by saying so", () => {
    const { history } = project([result("c1", "~/", home), { callId: "p1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 1 } }]);
    expect(noteOf(history[1]!).missing).toContain("No delivery of the current page was sent in parts");
  });

  it("sends the page whole again once the changes since its last whole view outgrow it, and the window keeps only that key's newest whole delivery (D7)", () => {
    const views = ["One", "Two", "Three", "Four"].map((word) => lines("PAGE \"P\"", `t1 text "${word.repeat(6)}"`, "t7 pad seven", "t8 pad eight", "t9 pad nine"));
    const records = views.map((view, index) => result(`c${index + 1}`, "~/p", view));
    const other = result("o1", "~/q", lines("PAGE \"Q\""));
    const { history, window } = project([records[0]!, other, records[1]!, records[2]!]);
    // c2's changes fit under the base; c3's would outgrow it, so c3 is whole. c1 and c2 read as they were sent.
    expect(noteOf(history[0]!)).toEqual({ key: "~/p", shown: "whole", in: W });
    expect(noteOf(history[2]!)).toEqual({ key: "~/p", shown: "changes", since: "c1", in: W });
    expect(noteOf(history[3]!)).toEqual({ key: "~/p", shown: "whole", in: W });
    expect(heldOf(window, "~/p")).toEqual([{ call: "c3", whole: textOf(views[2]!) }]);
    expect(heldOf(window, "~/q")).toEqual([{ call: "o1", whole: "PAGE \"Q\"" }]);
  });

  it("sends a change longer than the page itself as the page whole", () => {
    const before = lines("PAGE \"P\"", "t1 a");
    const after = lines("PAGE \"P\"", "t2 a much longer line than the whole page was");
    const { history, window } = project([result("c1", "~/p", before), result("c2", "~/p", after)]);
    expect(noteOf(history[1]!)).toEqual({ key: "~/p", shown: "whole", in: W });
    expect(heldOf(window, "~/p")).toEqual([{ call: "c2", whole: textOf(after) }]);
  });

  it("delivers a page whole again in a fresh window that does not hold its earlier views", () => {
    const changed = lines("PAGE \"Home\"", "t1 link \"One\"");
    expect(heldOf(project([result("c2", "~/", changed)]).window, "~/")).toEqual([{ call: "c2", whole: textOf(changed) }]);
  });

  it("projects the same records to the same bytes, never mutates them, and holds no window without a page", () => {
    const log: Entry[] = [result("c1", "~/", home), { callId: "n1", toolId: "core.request_check", value: { ok: false } }, result("c2", "~/cart", lines("PAGE \"Cart\""))];
    const frozen = structuredClone(log);
    expect(JSON.stringify(project(log))).toBe(JSON.stringify(project(structuredClone(log))));
    expect(log).toEqual(frozen);
    const plain = { callId: "x", toolId: "web.read", value: { ok: true } };
    expect(project([plain])).toEqual({ history: [plain] });
  });

  it("leaves a record without a page view as it came, and delivers a view whose keys repeat whole without comparing the next one with it", () => {
    const plain: Entry = { callId: "x", toolId: "web.read", value: { ok: true, page: "text" } };
    const repeated = [{ key: "t1", text: "t1 a" }, { key: "t1", text: "t1 b" }];
    const { history, window } = project([plain, result("c1", "~/", repeated), result("c2", "~/", home)]);
    expect(history[0]).toBe(plain);
    expect(heldOf(project([result("c1", "~/", repeated)]).window, "~/")).toEqual([{ call: "c1", whole: "t1 a\nt1 b" }]);
    // The next view of that page is whole, and it is then the one delivery of that page the window keeps.
    expect(noteOf(history[2]!)).toEqual({ key: "~/", shown: "whole", in: W });
    expect(heldOf(window, "~/")).toEqual([{ call: "c2", whole: textOf(home) }]);
  });

  it("delivers a recalled page whole as the page that call ended on, without changing the current page's state", () => {
    const recall: Entry = { callId: "r1", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { recalled: "c0", restored: { pageView: { key: "~/old", lines: lines("PAGE \"Old\"") } } } };
    const { history, window } = project([result("c1", "~/", home), recall, result("c2", "~/", home)]);
    expect(((history[1]!.value as JsonObject).restored as JsonObject).pageView).toEqual({ key: "~/old", recalled: true, shown: "whole", in: W });
    expect(pagesOf(window).find((page) => page.key === "~/old")).toEqual({ key: "~/old", recalled: true, shown: [{ call: "r1", whole: "PAGE \"Old\"" }] });
    expect(noteOf(history[2]!)).toEqual({ key: "~/", since: "c1", unchanged: true });
  });

  it("defaults to the budget every recorded view fits in", () => {
    expect(AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS).toBe(20_000);
    const big = Array.from({ length: 500 }, (_, index) => ({ key: `t${index}`, text: `t${index} ${"w".repeat(40)}` }));
    expect(heldOf(project([result("c1", "~/", big)]).window, "~/")![0]!.part).toBe("1 of 2");
  });
});

describe("the page budget per request (D6)", () => {
  // Pages of 100 characters each: ten lines of nine characters and their nine line breaks.
  const page = (prefix: string, changed = -1): AutomationStudioLlmPageLine[] =>
    Array.from({ length: 10 }, (_, index) => ({ key: `${prefix}${index}`, text: `${prefix}${index} ${index === changed ? "CHANGED" : "aaaaaaa"}`.slice(0, 9).padEnd(9, ".") }));
  const pageText = (window: Entry | undefined): number => pagesOf(window).reduce((sum, held) => sum + (held.shown as JsonObject[]).reduce((total, delivery) =>
    total + [delivery.whole, delivery.changes].reduce<number>((size, text) => size + (typeof text === "string" ? text.length : 0), 0), 0), 0);
  const budget = { member: "pageView", budgetChars: 250 };
  const letGoOf = (window: Entry | undefined): JsonValue | undefined => (window?.value as JsonObject | undefined)?.letGo;

  it("lets the least recently delivered other pages go, oldest first, until the window's page text fits, and never the page being delivered", () => {
    const { history, window } = project([result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("c1", "~/c", page("c"))], budget);
    expect(pagesOf(window).map((held) => held.key)).toEqual(["~/b", "~/c"]);
    expect(letGoOf(window)).toEqual([{ key: "~/a", at: "c1" }]);
    // The let-go page's result still reads as it was sent: it names its page, and the window says it was let go.
    expect(noteOf(history[0]!)).toEqual({ key: "~/a", shown: "whole", in: W });
    expect(pageText(window)).toBeLessThanOrEqual(250);
  });

  it("lets go by when a page was last delivered, not when it was first met", () => {
    const { window } = project([result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("a2", "~/a", page("a", 3)), result("c1", "~/c", page("c"))], budget);
    expect(letGoOf(window)).toEqual([{ key: "~/b", at: "c1" }]);
    expect(heldOf(window, "~/a")!.map((delivery) => (delivery.changes !== undefined ? "changes" : "whole"))).toEqual(["whole", "changes"]);
  });

  it("delivers a page let go whole when the work comes back to it, and no longer names it as let go", () => {
    const { history, window } = project([result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("c1", "~/c", page("c")), result("a2", "~/a", page("a", 3))], budget);
    expect(noteOf(history[3]!)).toEqual({ key: "~/a", shown: "whole", in: W });
    expect(heldOf(window, "~/a")).toEqual([{ call: "a2", whole: textOf(page("a", 3)) }]);
    expect(letGoOf(window)).toEqual([{ key: "~/b", at: "a2" }]);
    expect(pageText(window)).toBeLessThanOrEqual(250);
  });

  it("sends the current page whole instead of changes that would take its own deliveries past the budget", () => {
    const records = [0, 1, 2, 3, 4, 5].map((n) => result(`a${n}`, "~/a", page("a", n)));
    for (let count = 1; count <= records.length; count += 1) {
      expect(pageText(project(records.slice(0, count), { member: "pageView", budgetChars: 140 }).window), `after ${count}`).toBeLessThanOrEqual(140);
    }
  });

  // t1080: live run-mwytbimp-e0c33977 went between results pages 1 and 2 of one list (one key, the budget fitting one
  // page), and each visit rewrote the other page's earlier copy, moving the prompt cache's shared prefix back.
  it("never changes an earlier record when a page is replaced, let go or delivered again: only the trailing entry moves", () => {
    const pageOne = page("a");
    const pageTwo = page("b");
    const log: Entry[] = [];
    let previous: Entry[] = [];
    let replaced = 0;
    let letGo = 0;
    for (let n = 0; n < 24; n += 1) {
      // One key going between two pages, each too large to hold beside the other, and other keys between.
      const key = n % 4 === 3 ? `~/other${n % 3}` : "~/results";
      log.push(result(`k${n}`, key, key === "~/results" ? (n % 2 ? pageTwo : pageOne) : page("c", n % 10)));
      const { history, window } = project(log, { member: "pageView", budgetChars: 150 });
      expect(pageText(window), `window ${n}`).toBeLessThanOrEqual(150);
      expect(JSON.stringify(history.slice(0, previous.length)), `appending record ${n + 1}`).toBe(JSON.stringify(previous));
      if (letGoOf(window) !== undefined) letGo += 1;
      if (noteOf(history[n]!).shown === "whole" && n > 0) replaced += 1;
      previous = history;
    }
    expect(replaced).toBeGreaterThan(5);
    expect(letGo).toBeGreaterThan(0);
  });

  it("keeps an earlier record byte for byte across every kind of delivery", () => {
    const small = { member: "pageView", budgetChars: 230 };
    const long = Array.from({ length: 30 }, (_, index) => ({ key: `t${index}`, text: `t${index} ${"w".repeat(18)}` }));
    const log: Entry[] = [
      result("c1", "~/", home),
      { callId: "n1", toolId: "core.request_check", value: { ok: false } },
      result("c2", "~/", [...home, { key: "t5", text: "t5 link \"Five\"" }]),
      result("c3", "~/cart", lines("PAGE \"Cart\"")),
      result("c4", "~/", home),
      result("c5", "~/long", long),
      { callId: "p2", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 2 } },
      { callId: "r1", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { recalled: "c1", restored: { pageView: { key: "~/", lines: home } } } },
      result("c6", "~/", lines("PAGE \"Home\"", "t1 link \"Changed\"")),
      { callId: "f1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { pageView: { key: "~/", lines: home } } }
    ];
    for (let count = 1; count < log.length; count += 1) {
      const before = JSON.stringify(project(log.slice(0, count), small).history);
      const after = JSON.stringify(project(log.slice(0, count + 1), small).history.slice(0, count));
      expect(after, `appending record ${count + 1}`).toBe(before);
    }
  });
});
