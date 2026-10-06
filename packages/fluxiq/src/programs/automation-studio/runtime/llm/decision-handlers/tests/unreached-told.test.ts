// A step an applied decision leaves without its way to its page is told to the
// model, and is no refusal anywhere (live run `run-muwao5n4-44977b2a`, lane D,
// D2-1). Decision 0025 added the request listing at step 2, before both
// navigations that reach the requests page, and was told only "applied".
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const go = { toolId: "go", description: "Go, press or read.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const HOME = "https://example.test/";
const FRIENDS = "https://example.test/friends/";
const REQUESTS = "https://example.test/friends/requests/";
/** A call that worked on the page `at`, as the host writes where it found the page. */
const worked = (at: string) => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click", replay: { from: { location: at } } } });
const call = (index: number, over: JsonObject = {}) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "go", input: { target: `#t${index}` }, ...over });
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const feedbackAt = (decide: { mock: { calls: unknown[][] } }, index: number) =>
  ((decide.mock.calls[index]![0] as { evidence: Shown }).evidence).find((entry) => entry.toolId === "core.amendment_check")?.value;

describe("a step an applied decision leaves without its way to its page", () => {
  it("is told beside the applied decision, and the decision reads applied, refusing nothing", async () => {
    const decide = vi.fn();
    // Home, to friends, to requests (all in the Flow), then the listing on the requests page, run and not added.
    for (const decision of [call(1, { add: true }), call(2, { add: true }), call(3, { add: true }), call(4), { kind: "amend_draft", amendments: [{ step: 4, change: "add", to: 2 }] }]) decide.mockResolvedValueOnce(decision);
    decide.mockResolvedValueOnce(complete);
    const executeTool = vi.fn();
    for (const at of [HOME, HOME, FRIENDS, REQUESTS]) executeTool.mockResolvedValueOnce(worked(at));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled } });

    expect(result.steps.map((step) => step.id)).toEqual(["d1", "d4", "d2", "d3"]);
    const told = feedbackAt(decide, 5);
    expect(told).toMatchObject({
      ok: true,
      code: "llm_evidence_loop.draft_step_unreached",
      refused: [],
      applied: 1,
      unreached: [{ step: 4, after: 1, reachedBy: [3], note: expect.stringContaining("the step before it now, step 1, does not leave the page where step 4 acted") }]
    });
    expect(String((told as JsonObject).instruction)).not.toContain("changed nothing");
    // Not a refusal anywhere the decision is recorded: the row carries none, so its answer reads applied.
    const row = result.trace.find((entry) => entry.decision === "amend_draft");
    expect(row).toMatchObject({ resultCode: "llm_evidence_loop.draft_amended", amended: 1 });
    expect(row?.amendmentsRefused).toBeUndefined();
  });
});
