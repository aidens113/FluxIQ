import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioSiteResetPlacedCall, type AutomationStudioSiteResetPlace, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetReadAnswer } from "../index.ts";

// Reading the target around a call that makes or undoes an act (t471): the
// act's own page before it and what it changed there, and whether an undo
// changed the page it ran on and stayed there.

function harness(reads: AutomationStudioSiteResetReadAnswer[], act?: string) {
  const asked: Array<JsonObject | undefined> = [];
  const placed: Array<[string, AutomationStudioSiteResetPlace]> = [];
  const seen: Array<[string, boolean]> = [];
  let ran = 0;
  const run = (call: { callId: string; toolId?: string; value: JsonObject }) => automationStudioSiteResetPlacedCall({
    call: { toolId: "core.run_node", ...call },
    ledger: {
      actOf: () => act,
      placed: (id, place) => {
        placed.push([id, place]);
      },
      undoSeen: (id, changed) => {
        seen.push([id, changed]);
      }
    },
    reader: {
      read: async (start) => {
        asked.push(start);
        return reads.shift() ?? { unread: "no_answer" };
      }
    },
    run: async () => {
      ran += 1;
      return "ran";
    }
  });
  return { run, asked, placed, seen, ran: () => ran };
}

const at = (location: string, differs: string[] = [], state: JsonObject = { page: location }): AutomationStudioSiteResetRead => ({ state, differs, location, lines: { gone: [], added: differs } });

describe("site reset reads around an act", () => {
  it("keeps an act's page before it and what it changed there, read in place before and after", async () => {
    const h = harness([at("https://site.test/item"), at("https://site.test/item", ["2 in basket"])], "act-1");
    expect(await h.run({ callId: "add", value: { node: "demo.press", consequences: ["create_new"] } })).toBe("ran");
    expect(h.asked).toEqual([undefined, { page: "https://site.test/item" }]);
    expect(h.placed).toEqual([["act-1", { state: { page: "https://site.test/item" }, location: "https://site.test/item", changed: ["2 in basket"], lines: { gone: [], added: ["2 in basket"] } }]]);
  });

  it("keeps no place for an act that left its page, or a call that made no act", async () => {
    const left = harness([at("https://site.test/item"), at("https://site.test/done", ["x"])], "act-1");
    await left.run({ callId: "submit", value: { node: "demo.press", consequences: ["create_new"] } });
    expect(left.placed).toEqual([]);
    const none = harness([at("https://site.test/item"), at("https://site.test/item", ["x"])]);
    await none.run({ callId: "add", value: { node: "demo.press", consequences: ["create_new"] } });
    expect(none.placed).toEqual([]);
  });

  it("tells the ledger an undo changed its page only when it stayed on it and something differs", async () => {
    const words = harness([at("https://site.test/requests"), at("https://site.test/requests")]);
    await words.run({ callId: "click.words", value: { node: "demo.press", consequences: [], undoes: "act-1" } });
    const link = harness([at("https://site.test/requests"), at("https://site.test/messages", ["x"])]);
    await link.run({ callId: "click.link", value: { node: "demo.press", consequences: [], undoes: "act-2" } });
    const remove = harness([at("https://site.test/basket"), at("https://site.test/basket", ["gone line"])]);
    await remove.run({ callId: "remove", value: { node: "demo.press", consequences: ["delete"], undoes: "act-3" } });
    expect([...words.seen, ...link.seen, ...remove.seen]).toEqual([["act-1", false], ["act-2", false], ["act-3", true]]);
  });

  it("observes destinations after non-undo calls without placing an act, and leaves other tools alone", async () => {
    const h = harness([]);
    await h.run({ callId: "look", value: { node: "demo.look", consequences: [] } });
    await h.run({ callId: "pay", value: { node: "demo.pay", consequences: ["move_money"] } });
    await h.run({ callId: "find", toolId: "web.find_on_page", value: { text: "x" } });
    expect(h.asked).toEqual([undefined, undefined]);
    expect(h.ran()).toBe(3);
  });

  it("runs the call and tells the ledger nothing when the target cannot be read", async () => {
    const h = harness([{ unread: "failed" }], "act-1");
    expect(await h.run({ callId: "add", value: { node: "demo.press", consequences: ["create_new"] } })).toBe("ran");
    expect(h.placed).toEqual([]);
    expect(h.seen).toEqual([]);
  });

  it("tells the ledger an act whose page shows nothing new had no effect, and keeps no place for it (t475)", async () => {
    const noEffect: string[] = [];
    const reads = [at("https://site.test/item"), at("https://site.test/item")];
    await automationStudioSiteResetPlacedCall({
      call: { callId: "add", toolId: "core.run_node", value: { node: "demo.press", consequences: ["create_new"] } },
      ledger: { actOf: () => "act-1", placed: () => { throw new Error("no place for an act with no effect"); }, undoSeen: () => undefined, noEffect: (act) => { noEffect.push(act); } },
      reader: { read: async () => reads.shift() ?? { unread: "no_answer" } },
      run: async () => "ran"
    });
    expect(noEffect).toEqual(["act-1"]);
  });

  it("counts as created only the items the page shows after the act that no read of the build had seen, reading after it settled (t475)", async () => {
    const placed: AutomationStudioSiteResetPlace[] = [];
    const reads: AutomationStudioSiteResetRead[] = [
      { ...at("https://site.test/basket"), items: ["line:before"] },
      { ...at("https://site.test/basket", ["new line"]), items: ["line:before", "line:seen-elsewhere", "line:added"] }
    ];
    let settled = 0;
    await automationStudioSiteResetPlacedCall({
      call: { callId: "add", toolId: "core.run_node", value: { node: "demo.press", consequences: ["create_new"] } },
      ledger: { actOf: () => "act-1", placed: (_act, place) => { placed.push(place); }, undoSeen: () => undefined },
      reader: {
        read: async () => reads.shift() ?? { unread: "no_answer" },
        settled: async () => {
          settled += 1;
          return reads.shift() ?? { unread: "no_answer" };
        },
        seenItems: () => new Set(["line:before", "line:seen-elsewhere"])
      },
      run: async () => "ran"
    });
    expect(settled).toBe(1);
    expect(placed).toEqual([{ state: { page: "https://site.test/basket" }, location: "https://site.test/basket", changed: ["new line"], lines: { gone: [], added: ["new line"] }, created: ["line:added"] }]);
  });

  it("counts nothing created when the read before the act listed no items: absence before needs a read that listed them (t479)", async () => {
    const placed: AutomationStudioSiteResetPlace[] = [];
    const reads: AutomationStudioSiteResetRead[] = [at("https://site.test/basket"), { ...at("https://site.test/basket", ["new line"]), items: ["line:before", "line:added"] }];
    await automationStudioSiteResetPlacedCall({
      call: { callId: "add", toolId: "core.run_node", value: { node: "demo.press", consequences: ["create_new"] } },
      ledger: { actOf: () => "act-1", placed: (_act, place) => { placed.push(place); }, undoSeen: () => undefined },
      reader: { read: async () => reads.shift() ?? { unread: "no_answer" }, seenItems: () => new Set() },
      run: async () => "ran"
    });
    expect(placed).toHaveLength(1);
    expect(placed[0]!.created).toBeUndefined();
  });

  it("never takes two reads with no location for one page: an undo there is left to the ledger, and an act gets no place (t479)", async () => {
    const unplaced = (differs: string[]): AutomationStudioSiteResetRead => ({ state: {}, differs, lines: { gone: [], added: differs } });
    const undo = harness([unplaced([]), unplaced(["gone line"])]);
    await undo.run({ callId: "remove", value: { node: "demo.press", consequences: ["delete"], undoes: "act-1" } });
    expect(undo.seen).toEqual([]);
    const act = harness([unplaced([]), unplaced(["new line"])], "act-2");
    await act.run({ callId: "add", value: { node: "demo.press", consequences: ["create_new"] } });
    expect(act.placed).toEqual([]);
  });
});
