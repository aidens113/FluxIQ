// What a domain declared of a list's paging reaches the header, and a run's pass of a step on the page it read is that
// page again though its answer names no list (t1032). The recorded shapes (run-mwv5m906-5e999159): the detection of the
// result step's list declared no pager while the header said its paging was not yet checked; the Flow's replay of the
// step answered with rows and no `listKey`, and came back as a second page, "unplaced read 1", beside offset=0.
// Generic catalogue fixtures; no scenario's site, task or answer.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstListPagerEvents } from "../index.ts";
import { resultPipeline } from "./pipeline.ts";

const LIST = "list.catalogue";
const SHELF = "https://shop.example/shelf";
const rows = (count: number): JsonObject[] => Array.from({ length: count }, (_, index) => ({ title: `Item ${index + 1}`, price: `${index + 1}` }));
const detected = (listPaging: unknown): AutomationStudioLlmEvidenceToolExecutionResult => ({ kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: true, itemCount: 8, listPaging } as unknown as JsonObject });
const detectCall = (callId: string) => ({ callId, toolId: "example.detect_list", value: { target: "t1" } });
const places = (p: ReturnType<typeof resultPipeline>): readonly string[] => p.feed.evidence().coverage[0]?.places ?? [];

describe("a list's declared paging", () => {
  it("says a list declared to show no pager holds one page, where its paging was not yet checked", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(8), listKey: LIST, place: "offset=0", kind: "add", extra: { url: SHELF } });
    expect(p.feed.slot()).toContain("paging after offset=0 not yet checked");
    p.feed.called(detectCall("detect.1"), detected([{ listKey: LIST, pages: false }, { listKey: "list.cells", pages: false }]), undefined);
    expect(p.feed.slot()).toContain("the list shows no pager, so it holds one page");
    expect(p.feed.slot()).not.toContain("not yet checked");
  });

  it("is said before the read too, and the latest declaration of a list stands", async () => {
    const p = resultPipeline();
    p.feed.called(detectCall("detect.1"), detected([{ listKey: LIST, pages: false }]), undefined);
    await p.read({ source: "read.1", rows: rows(4), listKey: LIST, place: "offset=0", kind: "add", extra: { url: SHELF } });
    expect(p.feed.slot()).toContain("the list shows no pager, so it holds one page");
    p.feed.called(detectCall("detect.2"), detected([{ listKey: LIST, pages: true }]), undefined);
    expect(p.feed.slot()).toContain("paging after offset=0 not yet checked");
  });

  it("takes only well-formed declarations", () => {
    expect(automationStudioAnswerFirstListPagerEvents({ listPaging: [{ listKey: LIST, pages: false }, { listKey: "", pages: false }, { listKey: LIST, pages: "no" }, "list", { listKey: "x".repeat(201), pages: true }] })).toEqual([{ kind: "pager", listKey: LIST, pages: false }]);
    expect(automationStudioAnswerFirstListPagerEvents({ listPaging: { listKey: LIST, pages: false } })).toEqual([]);
    expect(automationStudioAnswerFirstListPagerEvents(undefined)).toEqual([]);
  });
});

describe("a run's pass of a draft read step whose answer names no list", () => {
  it("replayed on the page the step read is that page again, not a second page", async () => {
    const p = resultPipeline();
    const value = p.input();
    await p.read({ source: "read.6", rows: rows(8), listKey: LIST, place: "offset=0", value, kind: "add", position: 6, extra: { url: SHELF } });
    const step = { ...p.step("read.6", value, 6) };
    // The pass's answer, as a replay gives it: the rows and where it ran, no list key and no place.
    const call = { callId: "run.6", toolId: "core.run_node", value: { ...value, replay: "forward" } };
    const answer: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "core.replay.replayed", evidence: { read: { extracted: rows(8), url: SHELF } } };
    const saved = await p.sink.fromCall({ callId: call.callId, toolId: call.toolId, value: call.value }, answer);
    p.feed.called(call, answer, saved);
    p.feed.passed(step, [step], answer);
    expect(places(p)).toEqual(["offset=0"]);
    expect(p.feed.slot()).toContain("8 rows over 1 page: offset=0 (8)");
    expect(p.feed.evidence().pages.map((page) => page.source)).toEqual(["run.6"]);
  });
});
