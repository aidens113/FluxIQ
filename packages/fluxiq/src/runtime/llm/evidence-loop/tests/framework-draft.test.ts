// The evidence loop drafting the Flow itself (t1037; user, 2026-11-25: "Drafting the flow automatically will help in
// many situations, as long as the model is able and encouraged to edit it for more efficient flows"): what the
// framework puts in from the calls that worked, which read it takes as the result, what a step carries into the Flow,
// and the edits the model is offered.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES } from "../../../flow-authoring/draft/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceReadTests } from "../framework-draft/index.ts";

const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const read = { toolId: "read", description: "Read a list.", inputSchema: { type: "object" }, effect: "observe" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.click", proposes: true } };
const failed = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "web.action.failed" }, effectApplied: false, draft: { actionId: "web.click", proposes: true } };
const call = (id: string, toolId: string, input: JsonObject, over: JsonObject = {}) => ({ kind: "tool_call", callId: id, toolId, input, ...over });
/** A read's answer: the rows it kept under the domain's declared key, and the step the host says it ran. */
const readAnswer = (rows: JsonObject[], list: string) => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true, read: { extracted: rows } }, effectApplied: true,
  draft: { actionId: "web.read", effect: "observe", proposes: true, reads: list }
});
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

describe("the Flow the evidence loop drafts", () => {
  // Item 7 of the brief (W2's D13): the model names a list by a line of the page view, and the read detects the list
  // and stores the handle it issued and its binding; the Flow keeps what the read stored, never the model's line.
  it("keeps a read in the Flow with the handle and binding the read stored, not the line the model named it by", async () => {
    const stored = { node: "web.read", parameters: { extractList: { handle: "extraction.1" } } };
    const binding = { node: "web.read", parameters: { extractList: { handle: "extraction.1" } }, extractionBinding: { item: ".row", names: { title: "text" } } };
    const decide = vi.fn()
      .mockResolvedValueOnce(call("r1", "read", { node: "web.read", parameters: { extractList: { handle: "t12" } } }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce({
      kind: "llm_evidence_tool_execution", evidence: { ok: true, read: { extracted: [{ title: "One" }] } }, effectApplied: true,
      draft: { actionId: "web.read", effect: "observe", proposes: true, input: stored, ranWith: binding, reads: "list.1" }
    });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [read], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ disposition: "kept", drafted: "in", input: stored, ranWith: binding });
    expect(JSON.stringify(result.steps[0]!.input)).not.toContain("t12");
  });

  it("takes as the result the read whose rows hold the columns the instruction names, though another list is read after it", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(call("r1", "read", { list: "cart" }))
      .mockResolvedValueOnce(call("r2", "read", { list: "offers" }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn()
      .mockResolvedValueOnce(readAnswer([{ item: "Kettle", quantity: "1", price: "$20" }], "cart"))
      .mockResolvedValueOnce(readAnswer([{ name: "Toaster", rating: "4" }], "offers"));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [read], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled },
      namedColumns: ["item", "quantity", "price"], readRowsKey: "read.extracted"
    });
    expect(result.steps.map((step) => [step.callId, step.drafted])).toEqual([["r1", "in"], ["r2", "not_the_result"]]);
    // Without the named columns the last read is the result.
    const plain = vi.fn().mockResolvedValueOnce(call("r1", "read", { list: "cart" })).mockResolvedValueOnce(call("r2", "read", { list: "offers" })).mockResolvedValueOnce(complete);
    const executePlain = vi.fn()
      .mockResolvedValueOnce(readAnswer([{ item: "Kettle", quantity: "1", price: "$20" }], "cart"))
      .mockResolvedValueOnce(readAnswer([{ name: "Toaster", rating: "4" }], "offers"));
    const last = await runAutomationStudioLlmEvidenceLoop({ tools: [read], decide: plain, executeTool: executePlain, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled }, readRowsKey: "read.extracted" });
    expect(last.steps.map((step) => [step.callId, step.drafted])).toEqual([["r1", "not_the_result"], ["r2", "in"]]);
  });

  it("redoes a failed step in its place with the rerun edit: the new run stands where it stood, in the Flow", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(call("c1", "press", { target: "#a" }))
      .mockResolvedValueOnce(call("c2", "press", { target: "#wrong" }))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { target: "#right" } }] })
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce(worked).mockResolvedValueOnce(failed).mockResolvedValueOnce(worked);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [press], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => [step.id, step.position, step.disposition, step.drafted, step.input])).toEqual([
      ["d1", 1, "kept", "in", { target: "#a" }],
      ["d3", 2, "kept", "in", { target: "#right" }],
      ["d2", 3, "taken", "replaced", { target: "#wrong" }]
    ]);
  });

  it("brings back in a press after the result's read that the model names an act on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(call("r1", "read", { list: "rows" }))
      .mockResolvedValueOnce(call("c1", "press", { target: "#confirm" }, { act: "a1" }))
      .mockResolvedValueOnce(call("c2", "press", { target: "#elsewhere" }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce(readAnswer([{ name: "One" }], "rows")).mockResolvedValueOnce(worked).mockResolvedValueOnce(worked);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [read, press], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    // The press with the act is lasting and stays in; the press after it that nothing lasting follows leads nowhere.
    expect(result.steps.map((step) => [step.callId, step.drafted, step.acts])).toEqual([["r1", "in", undefined], ["c1", "in", ["a1"]], ["c2", "dead_end", undefined]]);
  });

  it("offers the framework's seven edits and shows the framework's telling", async () => {
    const decide = vi.fn().mockResolvedValueOnce(call("c1", "press", { target: "#a" })).mockResolvedValueOnce(complete);
    await runAutomationStudioLlmEvidenceLoop({ tools: [press], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled }, draft: { maxAmendments: 4 } });
    const schema = (decide.mock.calls[1]![0] as { decisionSchema: { oneOf: JsonObject[] } }).decisionSchema;
    const amend = schema.oneOf.find((variant) => ((variant.properties as JsonObject).kind as JsonObject).const === "amend_draft")!;
    const items = ((amend.properties as JsonObject).amendments as JsonObject).items as { properties: { change: { enum: string[] } } };
    expect(items.properties.change.enum).toEqual([...AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES]);
    expect(items.properties.change.enum).toContain("rerun");
    const draft = shownAt(decide, 1).find((entry) => entry.toolId === "core.flow_draft")!.value;
    expect(String(draft.instruction)).toContain("Core drafts the Flow from the calls that worked");
    expect(String(draft.instruction)).toContain("rerun to do a step again in its place");
  });
});

describe("which steps read a list, and which read the asked table", () => {
  const evidence = [
    { callId: "r1", toolId: "read", value: { read: { extracted: [{ Item: "Kettle", "unit price": "$20", quantity: 1 }] } } },
    { callId: "r2", toolId: "read", value: { readRows: { rows: [{ name: "Toaster" }] } } },
    { callId: "o1", toolId: "open", value: { ok: true, page: { heading: "A row's own page" } } }
  ];
  const step = (callId: string, over: Record<string, unknown> = {}) => ({ position: 1, iteration: 1, callId, actionId: "read", input: {}, effect: "observe" as const, disposition: "taken" as const, ...over });

  it("is a read where the host named the list or the answer kept rows; a page opened by its address is no read", () => {
    const { isRead } = automationStudioLlmEvidenceReadTests({ readRowsKey: "read.extracted", evidence });
    expect(isRead(step("r1"))).toBe(true);
    expect(isRead(step("r2"))).toBe(true);
    expect(isRead(step("o1"))).toBe(false);
    expect(isRead(step("o1", { reads: "list.1" }))).toBe(true);
    expect(isRead(step("r1", { effect: "mutate" }))).toBe(false);
  });

  it("is the asked table where its rows hold every named column, by name or written another way", () => {
    const { isAskedTable } = automationStudioLlmEvidenceReadTests({ namedColumns: ["item", "unit_price", "quantity"], readRowsKey: "read.extracted", evidence });
    expect(isAskedTable!(step("r1"))).toBe(true);
    expect(isAskedTable!(step("r2"))).toBe(false);
    expect(isAskedTable!(step("r1", { effect: "mutate" }))).toBe(false);
  });

  it("makes no asked-table test without named columns or a declared place for a read's rows", () => {
    expect(automationStudioLlmEvidenceReadTests({ namedColumns: [], readRowsKey: "read.extracted", evidence }).isAskedTable).toBeUndefined();
    expect(automationStudioLlmEvidenceReadTests({ namedColumns: ["item"], evidence }).isAskedTable).toBeUndefined();
  });
});

// The lending library's row-address repeat (t1037 phase 2): opening a row's page by its address observes and reads
// no list; taken for a read it was left out as not the result, and the repeat lost its first step.
describe("a step that observes and reads no list", () => {
  it("is in the Flow when it worked, beside the read that is the result", async () => {
    const open = { toolId: "open", description: "Open a page by its address.", inputSchema: { type: "object" }, effect: "observe" as const };
    const decide = vi.fn()
      .mockResolvedValueOnce(call("r1", "read", { list: "loans" }))
      .mockResolvedValueOnce(call("o1", "open", { url: "library://loan/one" }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn()
      .mockResolvedValueOnce(readAnswer([{ title: "One", url: "library://loan/one" }], "loans"))
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: { heading: "One" } }, effectApplied: true, draft: { actionId: "web.open", effect: "observe", proposes: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [read, open], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled }, readRowsKey: "read.extracted" });
    expect(result.steps.map((each) => [each.callId, each.drafted])).toEqual([["r1", "in"], ["o1", "in"]]);
  });
});
