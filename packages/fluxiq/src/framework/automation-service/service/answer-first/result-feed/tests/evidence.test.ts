import { describe, expect, it } from "vitest";
import { resultPipeline } from "./pipeline.ts";

describe("all declared result evidence follows the same ledger", () => {
  it("keeps an empty page, current conditions, exact place and the ended reason", async () => {
    const p = resultPipeline();
    const value = p.input([{ field: "price", lt: 5 }]);
    await p.read({ source: "s1", value, place: "page=1", rows: [{ title: "A", price: 2 }] });
    await p.read({ source: "s2", value, position: 2, place: "page=2", rows: [] });
    p.feed.port.record([{ kind: "paging", stepId: "s1", paging: { verdict: "ended", reason: "control_absent" } }]);
    const evidence = p.feed.evidence();
    expect(evidence.pages.map((page) => [page.place, page.kept])).toEqual([["page=1", 1], ["page=2", 0]]);
    expect(evidence.pages.every((page) => page.version === 1 && page.conditions.length === 1)).toBe(true);
    expect(evidence.coverage[0]).toMatchObject({ first: "read", last: { place: "page=2", paging: { verdict: "ended", reason: "control_absent" } } });
    expect(evidence.answerContract?.columns).toEqual(["title", "price"]);
  });
  it("repeated static whole-list reads replace their origin rather than inventing another page", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "offset=0", rows: [{ title: "A", price: 2 }] });
    await p.read({ source: "s2", place: "offset=0", position: 2, rows: [{ title: "B", price: 3 }] });
    expect(p.feed.evidence().pages).toHaveLength(1);
    expect(p.feed.rows().rows).toEqual([{ title: "B", price: 3 }]);
  });

  it("never invents place from the requested page or the address when the domain declares none", async () => {
    const p = resultPipeline();
    const value = p.input();
    value.parameters = { ...(value.parameters as object), page: 8 };
    await p.read({ source: "s1", value, rows: [{ title: "A", price: 2 }], extra: { url: "https://catalogue.test/list?page=8" } });
    expect(p.feed.evidence().pages[0]).not.toHaveProperty("place");
    expect(p.feed.evidence().coverage[0]?.first).toBe("unknown");
  });

  it.each([["offset=1", "not read"], ["cursor=1", "unknown"]])("never treats %s as the first numbered page", async (place, first) => {
    const p = resultPipeline();
    await p.read({ source: "s1", place, rows: [{ title: "A", price: 2 }] });
    expect(p.feed.evidence().coverage[0]?.first).toBe(first);
  });
  it("moves a step without losing its pages, and a dropped current version leaves the result", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "page=1", rows: [{ title: "A", price: 2 }] });
    p.feed.draft([p.step("s1", p.input(), 3)]);
    expect(p.feed.evidence().pages[0]?.position).toBe(3);
    p.feed.draft([]);
    expect(p.feed.rows().totalRows).toBe(0);
  });
  it("carried pages are marked and a real read of the same place replaces them", () => {
    const p = resultPipeline();
    p.feed.port.record([{ kind: "page", step: { id: "s1", position: 1 }, read: { source: "earlier", version: { conditions: [], fields: { title: ".name" }, listKey: "list.a" }, kept: [{ title: "A" }], place: "page=1", carried: true } }]);
    expect(p.feed.evidence().pages[0]?.carried).toBe(true);
    p.feed.port.record([{ kind: "page", step: { id: "s1", position: 1 }, read: { source: "now", version: { conditions: [], fields: { title: ".name" }, listKey: "list.a" }, kept: [{ title: "B" }], place: "page=1" } }]);
    expect(p.feed.evidence().pages[0]).toMatchObject({ source: "now", rows: [{ title: "B" }] });
    expect(p.feed.evidence().pages[0]?.carried).toBeUndefined();
  });
  it("working steps and looks retain their evidence while only the output step supplies the answer", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", rows: [{ title: "Working", price: 1 }], listKey: "list.working" });
    await p.read({ source: "s2", position: 2, rows: [{ title: "Answer", price: 2 }], listKey: "list.answer" });
    await p.read({ source: "look", kind: "look", rows: [{ title: "Evidence", price: 3 }] });
    expect(p.feed.rows().rows).toEqual([{ title: "Answer", price: 2 }]);
    // A working read goes with its rows, as a look does (t1048, `./working-rows.test.ts`).
    expect(p.feed.evidence().working).toEqual([expect.objectContaining({ step: "s1", position: 1, listKey: "list.working", kept: 1, rows: [{ title: "Working", price: 1 }] })]);
    expect(p.feed.evidence().looks[0]?.rows).toEqual([{ title: "Evidence", price: 3 }]);
  });
  it("retains every left-out row without confusing it with kept rows", () => {
    const p = resultPipeline();
    const label = "Long source line ".repeat(200);
    const leftOut = { where: [{ field: "ad", is: "present" }], columns: { title: ".name" }, sets: [{ kind: "alone" as const, conditions: [0], rows: [{ title: label }] }] };
    p.feed.port.record([{ kind: "page", step: { id: "s1", position: 1 }, read: { source: "read", version: { conditions: [], fields: { title: ".name" } }, kept: [{ title: "Kept" }], leftOut } }]);
    expect(p.feed.rows().rows).toEqual([{ title: "Kept" }]);
    expect(p.feed.evidence().pages[0]?.leftOut).toEqual(leftOut);
    expect(JSON.stringify(p.feed.evidence())).toContain(label);
  });
});
