// A move of a list the model ran itself settles that list's paging, by the list's key (t1013). The trail below has the
// shape of bikes run-mwug2xjw-41f62603: a read of a list, a next-page refused on a page the list is not on, then the
// move on the list's own page. Generic catalogue fixtures only.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstListMoveOf } from "../index.ts";
import { resultPipeline } from "./pipeline.ts";

const LIST = "list.catalogue";
const rows = (count: number, from = 0): JsonObject[] => Array.from({ length: count }, (_, index) => ({ title: `Item ${from + index + 1}`, price: `${index + 1}` }));
const nextCall = (callId: string) => ({ callId, toolId: "core.run_node", value: { node: "example.next_page", parameters: { nextPage: { list: "extraction.1" } } } });
const moved = (listMove: JsonObject) => ({ kind: "llm_evidence_tool_execution" as const, effectApplied: true, evidence: { ok: true, status: "succeeded", listMove } });
const refused = { kind: "llm_evidence_tool_execution" as const, effectApplied: false, evidence: { ok: false, code: "target_not_found", detail: { reason: "list_not_on_page", target: "extraction.1" } } };

describe("paging settled per list by a move the model ran", () => {
  it("reads as ended, not unsettled, once the list's own page showed no way on, after a move refused off the list (the bikes trail)", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), place: "offset=0", listKey: LIST });
    expect(p.feed.slot()).toContain("paging after offset=0 not yet checked");
    // The move made on an item page: refused, naming the list, and it settles nothing.
    expect(p.feed.called(nextCall("next.1"), refused, undefined)).toBeUndefined();
    expect(p.feed.slot()).toContain("paging after offset=0 not yet checked");
    // Back on the list's page, the move says the list has no way on.
    p.feed.called(nextCall("next.2"), moved({ listKey: LIST, verdict: "ended", said: "no Next control on the list's own page" }), undefined);
    const slot = p.feed.slot();
    expect(slot).toContain("the list ended after offset=0 (no Next control on the list's own page)");
    expect(slot).not.toContain("not yet checked");
    expect(p.feed.evidence().coverage[0]?.last?.paging).toEqual({ verdict: "ended", reason: "no Next control on the list's own page" });
  });

  it("says a page follows after a move, and the next page read is not yet checked", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), place: "page=1", listKey: LIST });
    p.feed.called(nextCall("next.1"), moved({ listKey: LIST, verdict: "moved", place: "page=2" }), undefined);
    expect(p.feed.slot()).toContain("a page follows page=1 (the list moved on), not read yet");
    await p.read({ source: "read.2", rows: rows(2, 3), place: "page=2", listKey: LIST });
    expect(p.feed.slot()).toContain("paging after page=2 not yet checked");
  });

  it("settles nothing for a move of another list", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), place: "page=1", listKey: LIST });
    p.feed.called(nextCall("next.1"), moved({ listKey: "list.other", verdict: "ended", said: "no way on" }), undefined);
    expect(p.feed.slot()).toContain("paging after page=1 not yet checked");
  });

  it("reads an end seen at a later page as a page following the one read, and one seen at an earlier page as nothing", async () => {
    const later = resultPipeline();
    await later.read({ source: "read.1", rows: rows(3), place: "page=1", listKey: LIST });
    later.feed.called(nextCall("next.1"), moved({ listKey: LIST, verdict: "ended", said: "no way on", place: "page=3" }), undefined);
    expect(later.feed.slot()).toContain("a page follows page=1 (the list moved on), not read yet");
    const earlier = resultPipeline();
    await earlier.read({ source: "read.1", rows: rows(3), place: "page=3", listKey: LIST });
    earlier.feed.called(nextCall("next.1"), moved({ listKey: LIST, verdict: "ended", said: "no way on", place: "page=1" }), undefined);
    expect(earlier.feed.slot()).toContain("paging after page=3 not yet checked");
    const same = resultPipeline();
    await same.read({ source: "read.1", rows: rows(3), place: "page=3", listKey: LIST });
    same.feed.called(nextCall("next.1"), moved({ listKey: LIST, verdict: "ended", said: "no way on", place: "page=3" }), undefined);
    expect(same.feed.slot()).toContain("the list ended after page=3 (no way on)");
  });

  it("takes a move only when it names a list and a verdict", () => {
    expect(automationStudioAnswerFirstListMoveOf({ listMove: { listKey: LIST, verdict: "ended", said: "  no way on  ", place: "page=2" } })).toEqual({ listKey: LIST, verdict: "ended", said: "no way on", place: "page=2" });
    expect(automationStudioAnswerFirstListMoveOf({ listMove: { verdict: "ended" } })).toBeUndefined();
    expect(automationStudioAnswerFirstListMoveOf({ listMove: { listKey: LIST, verdict: "failed" } })).toBeUndefined();
    expect(automationStudioAnswerFirstListMoveOf({ listMove: { listKey: "x".repeat(201), verdict: "moved" } })).toBeUndefined();
    expect(automationStudioAnswerFirstListMoveOf({ route: "ended" })).toBeUndefined();
  });
});
