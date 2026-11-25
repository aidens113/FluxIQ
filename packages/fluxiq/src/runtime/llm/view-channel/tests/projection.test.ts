// The page channel's projection (page-diff D1, D3, D6, D7): each result's page
// shown whole the first time the window meets its key, as git-style changes
// after, in parts past the budget, with earlier copies made references when a
// page is shown whole again, and the same bytes for the same records.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../../evidence-recall/index.ts";
import {
  AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID,
  AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS,
  automationStudioLlmPageChannelProjection,
  type AutomationStudioLlmPageLine
} from "../index.ts";

type Entry = { callId: string; toolId: string; value: JsonValue };
const channel = { member: "pageView" };

const lines = (...texts: string[]): AutomationStudioLlmPageLine[] => texts.map((text) => ({ key: text.split(" ")[0]!, text }));
const result = (callId: string, key: string, view: AutomationStudioLlmPageLine[], extra: JsonObject = {}): Entry =>
  ({ callId, toolId: "web.act", value: { ok: true, ...extra, pageView: { key, lines: view } } });
const shownPage = (entry: Entry): JsonObject => (entry.value as JsonObject).pageView as JsonObject;

const padding = ["p1 text \"Padding one\"", "p2 text \"Padding two\"", "p3 text \"Padding three\"", "p4 text \"Padding four\""];
const home = lines("PAGE \"Home\"", "t1 link \"One\"", "t2 button \"Two\"", "t3 field \"Three\"", ...padding);

describe("the page channel", () => {
  it("shows a page whole the first time the window meets its key, every other property where it was", () => {
    const [first] = automationStudioLlmPageChannelProjection([result("c1", "~/", home, { did: "pressed" })], channel);
    expect(Object.keys(first!.value as JsonObject)).toEqual(["ok", "did", "pageView"]);
    expect(shownPage(first!)).toEqual({ key: "~/", whole: home.map((line) => line.text).join("\n") });
  });

  it("shows a later view of the same key as git-style changes since the last one shown, and a first meeting of another key whole", () => {
    const changed = lines("PAGE \"Home\"", "t1 link \"One\"", "t2 button \"Two (2)\"", "t4 link \"Four\"", ...padding);
    const projected = automationStudioLlmPageChannelProjection([result("c1", "~/", home), result("c2", "~/", changed), result("c3", "~/cart", lines("PAGE \"Cart\"")), result("c4", "~/", changed)], channel);
    expect(shownPage(projected[1]!)).toEqual({
      key: "~/",
      since: "c1",
      read: expect.stringContaining("\"- \" left") as unknown as string,
      changes: ["  t1 link \"One\"", "~ t2 button \"Two (2)\"", "- t3 field \"Three\"", "+ t4 link \"Four\""].join("\n")
    });
    expect(shownPage(projected[2]!)).toEqual({ key: "~/cart", whole: "PAGE \"Cart\"" });
    // Unchanged since the last one shown of that key, and the legend is told once per window.
    expect(shownPage(projected[3]!)).toEqual({ key: "~/", since: "c2", unchanged: true });
  });

  it("shows lines marked extra in their own delivery and never compares a later view with them", () => {
    const captured = [...home, { key: "t9", text: "t9 hidden input \"code\"", extra: true as const }];
    const projected = automationStudioLlmPageChannelProjection([
      { callId: "f1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { pageView: { key: "~/", lines: captured } } },
      result("c2", "~/", home)
    ], channel);
    expect(shownPage(projected[0]!)).toEqual({ key: "~/", whole: captured.map((line) => line.text).join("\n") });
    expect(shownPage(projected[1]!)).toEqual({ key: "~/", since: "f1", unchanged: true });
  });

  it("sends a delivery past the budget in parts, saying how many lines are left and how to ask, and answers a part request from it", () => {
    const long = Array.from({ length: 30 }, (_, index) => ({ key: `t${index}`, text: `t${index} ${"w".repeat(18)}` }));
    const small = { member: "pageView", budgetChars: 230 };
    const records: Entry[] = [
      result("c1", "~/", long),
      { callId: "p2", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 2 } },
      { callId: "p9", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 9 } }
    ];
    const projected = automationStudioLlmPageChannelProjection(records, small);
    const first = shownPage(automationStudioLlmPageChannelProjection(records.slice(0, 1), small)[0]!);
    expect(first.part).toBe("1 of 3");
    // Part 2 and part 1 together would pass the budget, so part 1 lets go once part 2 is read.
    expect(shownPage(projected[0]!)).toEqual({ key: "~/", droppedAt: "p2" });
    expect((first.whole as string).length).toBeLessThanOrEqual(230);
    expect(first.rest).toBe(`Page text past the budget of 230 characters: 20 more lines in parts 2 to 3. Call ${AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID} with part 2 for the next.`);
    const second = shownPage(projected[1]!);
    expect(second).toMatchObject({ key: "~/", from: "c1", part: "2 of 3" });
    expect((second.whole as string).split("\n")[0]).toBe(long[10]!.text);
    expect((projected[1]!.value as JsonObject).part).toBe(2);
    // A part that does not exist is answered, never an ending.
    expect(shownPage(projected[2]!)).toEqual({ key: "~/", missing: "There is no part 9: the delivery in call c1 has 3 parts." });
    // Every line is in exactly one part, in page order.
    const third = shownPage(automationStudioLlmPageChannelProjection([records[0]!, { callId: "p3", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 3 } }], small)[1]!);
    expect([first.whole, second.whole, third.whole].join("\n")).toBe(long.map((line) => line.text).join("\n"));
    expect(third.rest).toBeUndefined();
  });

  it("answers a part request with no delivery in parts by saying so", () => {
    const projected = automationStudioLlmPageChannelProjection([result("c1", "~/", home), { callId: "p1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 1 } }], channel);
    expect(shownPage(projected[1]!).missing).toContain("No delivery of the current page was sent in parts");
  });

  it("sends the page whole again once the changes since its last whole view outgrow it, and turns that key's earlier copies into references (D7)", () => {
    const views = ["One", "Two", "Three", "Four"].map((word) => lines("PAGE \"P\"", `t1 text "${word.repeat(6)}"`, "t7 pad seven", "t8 pad eight", "t9 pad nine"));
    const records = views.map((view, index) => result(`c${index + 1}`, "~/p", view));
    const other = result("o1", "~/q", lines("PAGE \"Q\""));
    const projected = automationStudioLlmPageChannelProjection([records[0]!, other, records[1]!, records[2]!], channel);
    // c2's changes fit under the base; c3's would outgrow it, so c3 is whole and c1, c2 point to it. The other page is untouched.
    expect(shownPage(projected[0]!)).toEqual({ key: "~/p", replacedBy: "c3" });
    expect(shownPage(projected[2]!)).toEqual({ key: "~/p", replacedBy: "c3" });
    expect(shownPage(projected[3]!)).toEqual({ key: "~/p", whole: views[2]!.map((line) => line.text).join("\n") });
    expect(shownPage(projected[1]!)).toEqual({ key: "~/q", whole: "PAGE \"Q\"" });
  });

  it("sends a change longer than the page itself as the page whole", () => {
    const before = lines("PAGE \"P\"", "t1 a");
    const after = lines("PAGE \"P\"", "t2 a much longer line than the whole page was");
    const projected = automationStudioLlmPageChannelProjection([result("c1", "~/p", before), result("c2", "~/p", after)], channel);
    expect(shownPage(projected[1]!).whole).toBe(after.map((line) => line.text).join("\n"));
    expect(shownPage(projected[0]!)).toEqual({ key: "~/p", replacedBy: "c2" });
  });

  it("shows a page whole again in a fresh window that does not hold its earlier views", () => {
    const changed = lines("PAGE \"Home\"", "t1 link \"One\"");
    const fresh = automationStudioLlmPageChannelProjection([result("c2", "~/", changed)], channel);
    expect(shownPage(fresh[0]!)).toEqual({ key: "~/", whole: changed.map((line) => line.text).join("\n") });
  });

  it("projects the same records to the same bytes, and appending a record never changes how earlier ones read short of a new whole view", () => {
    const log: Entry[] = [
      result("c1", "~/", home),
      { callId: "n1", toolId: "core.request_check", value: { ok: false } },
      result("c2", "~/", [...home, { key: "t5", text: "t5 link \"Five\"" }]),
      result("c3", "~/cart", lines("PAGE \"Cart\"")),
      result("c4", "~/", home)
    ];
    const frozen = structuredClone(log);
    for (let count = 1; count < log.length; count += 1) {
      const before = JSON.stringify(automationStudioLlmPageChannelProjection(log.slice(0, count), channel));
      const after = JSON.stringify(automationStudioLlmPageChannelProjection(log.slice(0, count + 1), channel).slice(0, count));
      expect(after, `appending record ${count + 1}`).toBe(before);
    }
    expect(JSON.stringify(automationStudioLlmPageChannelProjection(log, channel))).toBe(JSON.stringify(automationStudioLlmPageChannelProjection(structuredClone(log), channel)));
    expect(log).toEqual(frozen);
  });

  it("leaves a record without a page view as it came, and shows a view whose keys repeat whole without comparing the next one with it", () => {
    const plain: Entry = { callId: "x", toolId: "web.read", value: { ok: true, page: "text" } };
    const repeated = [{ key: "t1", text: "t1 a" }, { key: "t1", text: "t1 b" }];
    const projected = automationStudioLlmPageChannelProjection([plain, result("c1", "~/", repeated), result("c2", "~/", home)], channel);
    expect(projected[0]).toBe(plain);
    expect(shownPage(automationStudioLlmPageChannelProjection([result("c1", "~/", repeated)], channel)[0]!)).toEqual({ key: "~/", whole: "t1 a\nt1 b" });
    // The next view of that page is whole, and it is then the one copy of that page the window keeps.
    expect(shownPage(projected[2]!).whole).toBeDefined();
    expect(shownPage(projected[1]!)).toEqual({ key: "~/", replacedBy: "c2" });
  });

  it("shows a recalled page whole as the page that call ended on, without changing the current page's state", () => {
    const recall: Entry = { callId: "r1", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { recalled: "c0", restored: { pageView: { key: "~/old", lines: lines("PAGE \"Old\"") } } } };
    const projected = automationStudioLlmPageChannelProjection([result("c1", "~/", home), recall, result("c2", "~/", home)], channel);
    expect(((projected[1]!.value as JsonObject).restored as JsonObject).pageView).toEqual({ key: "~/old", recalled: true, whole: "PAGE \"Old\"" });
    expect(shownPage(projected[2]!)).toEqual({ key: "~/", since: "c1", unchanged: true });
  });

  it("defaults to the budget every recorded view fits in", () => {
    expect(AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS).toBe(20_000);
    const big = Array.from({ length: 500 },(_, index) => ({ key: `t${index}`, text: `t${index} ${"w".repeat(40)}` }));
    expect(shownPage(automationStudioLlmPageChannelProjection([result("c1", "~/", big)], channel)[0]!).part).toBe("1 of 2");
  });
});

describe("the page budget per request (D6)", () => {
  // Pages of 100 characters each: ten lines of nine characters and their nine line breaks.
  const page = (prefix: string, changed = -1): AutomationStudioLlmPageLine[] =>
    Array.from({ length: 10 }, (_, index) => ({ key: `${prefix}${index}`, text: `${prefix}${index} ${index === changed ? "CHANGED" : "aaaaaaa"}`.slice(0, 9).padEnd(9, ".") }));
  const pageText = (window: Entry[]): number => window.reduce((sum, entry) => {
    const view = (entry.value as JsonObject).pageView as JsonObject | undefined;
    if (!view) return sum;
    return sum + [view.whole, view.changes].reduce<number>((total, text) => total + (typeof text === "string" ? text.length : 0), 0);
  }, 0);
  const budget = { member: "pageView", budgetChars: 250 };

  it("lets the least recently delivered other pages go, oldest first, until the window's page text fits, and never the page being delivered", () => {
    const projected = automationStudioLlmPageChannelProjection([result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("c1", "~/c", page("c"))], budget);
    expect(shownPage(projected[0]!)).toEqual({ key: "~/a", droppedAt: "c1" });
    expect(shownPage(projected[1]!).whole).toBeDefined();
    expect(shownPage(projected[2]!).whole).toBeDefined();
    expect(pageText(projected)).toBeLessThanOrEqual(250);
  });

  it("drops by when a page was last delivered, not when it was first met", () => {
    const projected = automationStudioLlmPageChannelProjection([
      result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("a2", "~/a", page("a", 3)), result("c1", "~/c", page("c"))
    ], budget);
    expect(shownPage(projected[1]!)).toEqual({ key: "~/b", droppedAt: "c1" });
    expect(shownPage(projected[0]!).whole).toBeDefined();
    expect(shownPage(projected[2]!).changes).toBeDefined();
  });

  it("shows a dropped page whole when the work comes back to it", () => {
    const projected = automationStudioLlmPageChannelProjection([
      result("a1", "~/a", page("a")), result("b1", "~/b", page("b")), result("c1", "~/c", page("c")), result("a2", "~/a", page("a", 3))
    ], budget);
    expect(shownPage(projected[3]!).whole).toBeDefined();
    expect(pageText(projected)).toBeLessThanOrEqual(250);
  });

  it("sends the current page whole instead of changes that would take its own copies past the budget", () => {
    const records = [0, 1, 2, 3, 4, 5].map((n) => result(`a${n}`, "~/a", page("a", n)));
    for (let count = 1; count <= records.length; count += 1) {
      expect(pageText(automationStudioLlmPageChannelProjection(records.slice(0, count), { member: "pageView", budgetChars: 140 })), `after ${count}`).toBeLessThanOrEqual(140);
    }
  });

  it("keeps every window within the budget, and appends without rewriting between drops", () => {
    const log: Entry[] = [];
    let drops = 0;
    let previous: Entry[] = [];
    for (let n = 0; n < 24; n += 1) {
      log.push(result(`k${n}`, `~/${"abc"[n % 3]!}${n % 5 === 0 ? "x" : ""}`, page("abc"[n % 3]!, n % 10)));
      const projected = automationStudioLlmPageChannelProjection(log, budget);
      expect(pageText(projected), `window ${n}`).toBeLessThanOrEqual(250);
      const rewritten = previous.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(projected[index]));
      if (rewritten) {
        drops += 1;
        expect(projected.some((entry) => "droppedAt" in shownPage(entry) || "replacedBy" in shownPage(entry)), `window ${n}`).toBe(true);
      }
      previous = projected;
    }
    expect(drops).toBeGreaterThan(0);
  });
});
