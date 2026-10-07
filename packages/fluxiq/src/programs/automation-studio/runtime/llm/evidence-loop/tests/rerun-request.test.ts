// A rerun the loop cannot carry out says so.
//
// `rerun` is the one amendment the draft does not apply, so the loop filters it
// out of the apply call and resolves it here. Until 2026-09-26 this function
// answered with the first runnable rerun or with nothing, and nothing reached
// nobody: the row read `llm_evidence_loop.draft_unchanged`, no refusal was
// recorded, and the model was asked again with no word about why its edit had
// not taken. These hold every way it declines to the refusal it now produces.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunRequest } from "../index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "../../repeat-guard/index.ts";

const step = (position: number, actionId: string, toolId?: string): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId,
  ...(toolId ? { toolId } : {}),
  input: { url: "https://example.test" },
  effect: "mutate",
  disposition: "kept"
});

describe("a retained argument after the actual rerun", () => {
  const tool = { toolId: "list", description: "List records.", inputSchema: { type: "object" }, effect: "observe" as const };
  const old = { extractList: { maxPages: 1, selector: "private-locator", paginate: { maxPages: 1 } } };
  const patch = { extractList: { paginate: { maxPages: 5 } } };
  const complete = { kind: "complete", result: { done: true } };
  // The preceding successful read permits editing after the later failed read.
  const draft = { seed: [{ ...step(1, "list"), effect: "observe" as const, effectApplied: true, proposes: true }] };
  const note = (decide: ReturnType<typeof vi.fn>, at: number) => {
    const shown = decide.mock.calls[at]?.[0].evidence as { toolId: string; value: JsonObject }[];
    return shown.find((entry) => entry.toolId === "core.rerun_check")?.value;
  };

  it.each(["refused", "threw", "invalid"])("shows safe retained paths after a %s rerun with no companion amendments", async (outcome) => {
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "first", toolId: "list", input: old })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(2, patch)] }).mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, draft: { proposes: true } });
    if (outcome === "threw") executeTool.mockRejectedValueOnce(new Error("synthetic failure"));
    else executeTool.mockResolvedValueOnce(outcome === "invalid" ? undefined : { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "malformed:extractList.maxPages" }, effectApplied: false, draft: { proposes: true } });
    await runAutomationStudioLlmEvidenceLoop({ tools: [tool], decide, executeTool, draft, deniedEvidenceKeys: ["selector"], unusableDecisions: { stalled: () => new Error("stalled") }, maxIterations: 5, maxToolCalls: 5, dryRun: false });
    expect(note(decide, 2)).toMatchObject({ step: 2, kept: ["extractList.maxPages"], removal: { extractList: { maxPages: null } }, attempt: { kind: "failed", callId: "rerun.2" } });
    expect(JSON.stringify(note(decide, 2))).not.toContain("selector");
    expect(JSON.stringify(note(decide, 2))).not.toContain("private-locator");
  });

  it("lets the next model remove the retained malformed key through the ordinary rerun", async () => {
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "first", toolId: "list", input: old })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(2, patch)] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(3, { extractList: { maxPages: null } })] }).mockResolvedValueOnce(complete);
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => ({ kind: "llm_evidence_tool_execution" as const,
      evidence: { ok: !Object.hasOwn(value.extractList as JsonObject, "maxPages") }, effectApplied: !Object.hasOwn(value.extractList as JsonObject, "maxPages"), draft: { proposes: true } }));
    await runAutomationStudioLlmEvidenceLoop({ tools: [tool], decide, executeTool, draft, deniedEvidenceKeys: ["selector"], unusableDecisions: { stalled: () => new Error("stalled") }, maxIterations: 6, maxToolCalls: 6, dryRun: false });
    expect(note(decide, 2)?.kept).toEqual(["extractList.maxPages"]);
    expect(executeTool).toHaveBeenCalledTimes(3);
    expect(executeTool.mock.calls[2]![0].value.extractList).not.toHaveProperty("maxPages");
    expect(note(decide, 3)).toBeUndefined();
  });

  it("does not emit paths without a declaration, or after a successful no-effect observation", async () => {
    for (const declared of [false, true]) {
      const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "first", toolId: "list", input: old })
        .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(2, patch)] }).mockResolvedValueOnce(complete);
      const executeTool = vi.fn().mockResolvedValue({ kind: "llm_evidence_tool_execution", evidence: { ok: declared }, effectApplied: false, draft: { proposes: true } });
      await runAutomationStudioLlmEvidenceLoop({ tools: [tool], decide, executeTool, draft, ...(declared ? { deniedEvidenceKeys: ["selector"] } : {}), unusableDecisions: { stalled: () => new Error("stalled") }, maxIterations: 5, maxToolCalls: 5, dryRun: false });
      expect(note(decide, 2)).toBeUndefined();
    }
  });

  it("keeps failed-rerun companion claims withheld", async () => {
    const press = { toolId: "press", description: "Change state.", inputSchema: { type: "object" }, effect: "mutate" as const };
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "first", toolId: "press", input: { config: { control: "first", kept: true } }, add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(1, { config: { control: "second" } }), { step: 1, change: "keep", act: "a2" }] }).mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true })
      .mockResolvedValueOnce({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [press], decide, executeTool, deniedEvidenceKeys: [], maxIterations: 5, maxToolCalls: 5, dryRun: false });
    const shown = decide.mock.calls[2]![0].evidence as { toolId: string; value: JsonObject }[];
    expect(shown.find((entry) => entry.toolId === "core.amendment_check")?.value).toMatchObject({ refused: [{ reason: "did_not_work" }] });
    expect(result.steps.some((candidate) => candidate.acts?.includes("a2"))).toBe(false);
    expect(note(decide, 2)?.attempt).toEqual({ kind: "failed", callId: "rerun.1" });
  });

  it("uses current checked acceptance instead of old failed evidence and never repeats the lasting act", async () => {
    const press = { toolId: "press", description: "Change state.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
    let performed = 0;
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => {
      if (value.replay === "reset") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      if (value.replay === "verify") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: false, resultCode: "core.replay.verified" };
      performed += 1;
      // A lasting effect was applied before an error; old failure is not this check's outcome.
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false }, effectApplied: true,
        draft: { actionId: "press", ranWith: value, effect: "mutate" as const, proposes: true, replay: { from: { location: "fixture" } } } };
    });
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "first", toolId: "press", input: { config: { control: "first", kept: true } }, add: true, act: "a1" })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(1, { config: { control: "second" } })] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(1, { config: { control: "third" } })] }).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [press], decide, executeTool, deniedEvidenceKeys: [], lastingActs: async () => new Set(["a1"]), maxIterations: 7, maxToolCalls: 7, dryRun: false });
    expect(performed).toBe(1);
    expect(executeTool.mock.calls.filter(([call]) => call.value.replay === "verify")).toHaveLength(2);
    expect(note(decide, 2)).toBeUndefined();
    expect(note(decide, 3)).toBeUndefined();
    expect(result.steps[0]).toMatchObject({ effectApplied: false, checkedCandidate: { code: "core.replay.verified" }, priorExecution: { effectApplied: true, lasting: true } });
  });

  it("reports retained binding paths as unexecuted and never turns write:true into written proof", async () => {
    const seeded: AutomationStudioFlowDraftStep = { ...step(1, "demo.press", "core.run_node"), input: { node: "demo.press", parameters: { query: { $state: { path: "query" } }, note: "before" }, consequences: [] }, effectApplied: true };
    const decide = vi.fn().mockResolvedValueOnce({ kind: "amend_draft", amendments: [rerun(1, { parameters: { note: "after" }, write: true })] }).mockResolvedValueOnce(complete);
    const executeTool = vi.fn();
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [{ toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" }], decide, executeTool, deniedEvidenceKeys: [], draft: { seed: [seeded] }, maxIterations: 5, maxToolCalls: 5, dryRun: false });
    expect(executeTool).not.toHaveBeenCalled();
    expect(note(decide, 1)).toMatchObject({ kept: ["query"], attempt: { kind: "refused", reason: "rerun_holds_binding" } });
    expect(note(decide, 1)?.attempt).not.toHaveProperty("callId");
    expect(JSON.stringify(note(decide, 1))).not.toContain("$state");
    expect(result.steps[0]?.written).toBeUndefined();
  });
});

const steps = [step(1, "web.observe_page"), step(2, "web.output.dom-extract_list", "core.run_node")];
const offered = new Set(["web.observe_page", "core.run_node"]);
const rerun = (position: number, input?: JsonObject): AutomationStudioFlowDraftAmendment =>
  ({ step: position, change: "rerun", ...(input ? { input } : {}) });

describe("the rerun a decision asked for", () => {
  it("is the first one the loop can run, through the tool the step went through, and refuses nothing", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 })], steps, offered);

    // The keys it changed, over the argument the step ran with (`../rerun-input.ts`).
    expect(resolved.request).toEqual({ step: 2, toolId: "core.run_node", input: { url: "https://example.test", rows: 40 }, callId: "rerun.2" });
    expect(resolved.refused).toEqual([]);
  });

  it("leaves a decision's other amendments alone, refusing none of them here", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest(
      [{ step: 1, change: "exploratory" }, { step: 99, change: "drop" }],
      steps,
      offered
    );

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([]);
  });
});

describe("a rerun the loop declines", () => {
  it("names a step that is not there in the draft's own word for it, so the model is told which numbers exist", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(7, { rows: 40 })], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 7, reason: "no_such_step" }]);
  });

  it("carried no argument to run with", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2)], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });

  it("names a step whose action the loop is not offering", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 })], steps, new Set(["web.observe_page"]));

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });

  it("is the second of two in one decision, because a decision is one call and a rerun is a call", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(2, { rows: 40 }), rerun(1, { url: "https://other.test" })], steps, offered);

    expect(resolved.request?.step).toBe(2);
    expect(resolved.refused).toEqual([{ step: 1, reason: "run_by_the_loop" }]);
  });

  it("is refused once per rerun, so a decision of four declined reruns produces four refusals", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(11), rerun(12), rerun(13), rerun(14)], steps, offered);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([
      { step: 11, reason: "no_such_step" },
      { step: 12, reason: "no_such_step" },
      { step: 13, reason: "no_such_step" },
      { step: 14, reason: "no_such_step" }
    ]);
  });
});

// t252: a written step is put back written, and a recorded step that holds a
// binding is never run live, because a binding resolves only in the Flow.
describe("a rerun of a step with bindings", () => {
  const nodeStep = (written: boolean, parameters: JsonObject): AutomationStudioFlowDraftStep => ({
    position: 3,
    id: "d3",
    iteration: 3,
    actionId: "demo.press",
    toolId: "core.run_node",
    input: { node: "demo.press", parameters, consequences: [] },
    effect: "mutate",
    disposition: "kept",
    ...(written ? { written: true as const } : {})
  });
  const runNode = new Set(["core.run_node"]);

  it("of a written step stays written: the call carries write true", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: "kept" })], [nodeStep(true, { target: { $state: { path: "item.name" } }, note: "old" })], runNode);

    expect(resolved.refused).toEqual([]);
    expect(resolved.request).toEqual({
      step: 3,
      toolId: "core.run_node",
      input: { node: "demo.press", parameters: { target: { $state: { path: "item.name" } }, note: "kept" }, consequences: [], write: true },
      callId: "rerun.3"
    });
  });

  it("of a written step translates a binding form it is given, as a written call is", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: { $input: "note", test: "hi" } })], [nodeStep(true, { note: "old" })], runNode);

    expect(resolved.request?.input).toEqual({ node: "demo.press", parameters: { note: { $state: { path: "note", fallback: "hi" } } }, consequences: [], write: true });
  });

  it("of a written step refuses a binding form that cannot be read, rather than send it as a literal", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: { $input: "Bad Name", test: "hi" } })], [nodeStep(true, { note: "old" })], runNode);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 3, reason: "bind_malformed" }]);
  });

  // P5 (t270, t273): a written step's rerun reads an output of a step before it, and only before it.
  const listed: AutomationStudioFlowDraftStep = { ...step(1, "demo.list", "core.run_node"), effect: "observe", effectApplied: true, proposes: true };

  it("of a written step translates a $step to an earlier step's own id", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: { $step: 1, output: "records" } })], [listed, nodeStep(true, { note: "old" })], runNode);

    expect(resolved.refused).toEqual([]);
    expect(resolved.request?.input).toEqual({ node: "demo.press", parameters: { note: { $state: { path: "$step.d1.records" } } }, consequences: [], write: true });
  });

  it("of a written step refuses a $step on itself or a step after it, unrun", () => {
    for (const position of [3, 4]) {
      const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: { $step: position, output: "records" } })], [listed, nodeStep(true, { note: "old" }), { ...listed, position: 4, id: "d4" }], runNode);

      expect(resolved.request, String(position)).toBeUndefined();
      expect(resolved.refused, String(position)).toEqual([{ step: 3, reason: "bind_malformed" }]);
    }
  });

  it("of a recorded step whose parameters stay bound is refused, unrun", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: "new" })], [nodeStep(false, { query: { $state: { path: "query", fallback: "towels" } }, note: "old" })], runNode);

    expect(resolved.request).toBeUndefined();
    expect(resolved.refused).toEqual([{ step: 3, reason: "rerun_holds_binding" }]);
  });

  it("of a recorded step given a binding form is refused, unrun", () => {
    for (const form of [{ $row: "name" }, { $input: "query", test: "towels" }, { $step: 2, output: "records" }]) {
      const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { note: form })], [nodeStep(false, { note: "old" })], runNode);

      expect(resolved.request).toBeUndefined();
      expect(resolved.refused).toEqual([{ step: 3, reason: "rerun_holds_binding" }]);
    }
  });

  it("of a recorded step that replaces every binding with a value runs live, unwritten", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(3, { query: "towels" })], [nodeStep(false, { query: { $state: { path: "query", fallback: "towels" } } })], runNode);

    expect(resolved.refused).toEqual([]);
    expect(resolved.request?.input).toEqual({ node: "demo.press", parameters: { query: "towels" }, consequences: [] });
  });
});

// Live run `run-musp474o-e0ed7432` reran "step 7" -- the withdrawn attempt its
// own rerun of step 6 had left -- with the where step 6 already held, three
// times; each was refused changes_nothing, which never said step 6 had it.
describe("a rerun of the attempt a rerun replaced", () => {
  it("is refused naming the step that replaced it, and runs nothing", () => {
    const list = (position: number, id: string, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
      ({ ...step(position, "web.output.dom-extract_list", "core.run_node"), id, effect: "observe", ...over });
    const draft = [list(6, "d18"), { ...step(7, "web.press", "core.run_node"), id: "d7" }, list(8, "d6", { disposition: "dropped", replacedBy: "d18" })];

    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(8, { where: "fixed" })], draft, offered, () => ({ callId: "earlier", outcome: "failed" }));

    expect(resolved).toEqual({ request: undefined, refused: [{ step: 8, reason: "not_a_kept_step", replacedBy: 6 }] });
  });
});

// Live run `run-mustvzvg-99695308` (C3): the read's rerun wrote `maxPages: 10`
// beside `paginate` and the domain refused it, naming that key; the refused call
// is step 8. Every later rerun targeted step 8 and moved the bound under
// `paginate`, and each merged back the stray key and was refused again (0063,
// 0070, 0073). The draft step keeps only the domain's code
// (`web.action.rejected.target_unobserved`), never the keys its refusal named,
// so what fixes it is reading what the patch restated (`../rerun-input.ts`).
describe("a rerun of a step the domain refused", () => {
  const columns = { name: "kName", price: "kPrice", ad: "data-ad-id" };
  const where = [{ field: "ad", is: "absent" }];
  const refusedRead = (): AutomationStudioFlowDraftStep => ({
    ...step(8, "web.output.dom-extract_list", "core.run_node"), id: "d16", effect: "observe", effectApplied: false, proposes: false,
    resultCode: "web.action.rejected.target_unobserved",
    input: { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.3", fields: columns, where, paginate: { next: "a[rel=next]" }, minItems: 0, maxPages: 10 } }, consequences: [] }
  });
  const extractListOf = (input: JsonObject | undefined): JsonObject => ((input?.parameters as JsonObject).extractList as JsonObject);

  it("runs without the key the model left out of the object it restated", () => {
    const patch = { extractList: { handle: "extraction.3", fields: columns, where, paginate: { mode: "next", next: "a[rel=next]", maxPages: 10 }, minItems: 0 } };

    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(8, patch)], [refusedRead()], offered, () => undefined, ["selector"]);

    // Before: the call carried `extractList.maxPages: 10` beside `paginate.maxPages: 10`.
    expect(extractListOf(resolved.request?.input)).toEqual(patch.extractList);
    // Nothing was kept that the model did not write, so there is nothing to tell.
    expect(resolved.request?.retained).toBeUndefined();
    expect(resolved.refused).toEqual([]);
  });

  it("still names the key it kept when the patch changed only what it named", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(8, { extractList: { paginate: { mode: "next", maxPages: 10 } } })], [refusedRead()], offered, () => undefined, ["selector"]);

    expect(extractListOf(resolved.request?.input)).toMatchObject({ maxPages: 10, paginate: { next: "a[rel=next]", mode: "next", maxPages: 10 } });
    // What the loop tells the model with the rerun's answer (`../../rerun-arguments/note.ts`).
    expect(resolved.request?.retained).toEqual({ step: 8, parameters: true, paths: [["extractList", "handle"], ["extractList", "fields"], ["extractList", "where"], ["extractList", "paginate", "next"], ["extractList", "minItems"], ["extractList", "maxPages"]] });
  });
});

// Live run `run-murdouox-c5294247` (R3): 0051 restated the listing's columns
// without `confirm`, and the merge kept it.
describe("a rerun that restates a column map", () => {
  const listing = (): AutomationStudioFlowDraftStep => ({
    ...step(7, "web.output.dom-extract_list", "core.run_node"), effect: "observe",
    input: { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.5", fields: { name: "kA", mutual: "kB", confirm: "kC" } } }, consequences: [] }
  });
  const fieldsOf = (input: JsonObject | undefined): JsonObject => (((input?.parameters as JsonObject).extractList as JsonObject).fields as JsonObject);
  const patch = { extractList: { fields: { name: "kA", mutualFriends: "kB" } } };

  it("runs with the columns it wrote, given the domain's denied keys", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(7, patch)], [listing()], offered, () => undefined, ["selector"]);
    expect(fieldsOf(resolved.request?.input)).toEqual({ name: "kA", mutualFriends: "kB" });
  });

  it("keeps the column without them, as before", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(7, patch)], [listing()], offered);
    expect(fieldsOf(resolved.request?.input)).toEqual({ name: "kA", mutualFriends: "kB", confirm: "kC" });
  });
});

// Live run `run-muxky54f-fadb9d03` (lane D round 4, D4-1): step 11 read the
// listing with `where [{field: mutual, atLeast: 5}]`, step 12 read it again with
// no where and was kept as the Flow's listing. Five reruns of step 12 with that
// where (0025-0037) merged to exactly step 11's call on the page both started
// on, which the repeat guard holds as `changed_nothing` -- any read does -- and
// each was refused `changes_nothing`, unrun, though it would have changed step
// 12. The Flow kept the unfiltered listing.
describe("a rerun of a read whose argument an earlier identical read on its page already ran", () => {
  const where = [{ field: "mutual", atLeast: 5 }];
  const read = (position: number, extractList: JsonObject, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    ...step(position, "web.output.dom-extract_list", "core.run_node"), effect: "observe", effectApplied: true, proposes: true,
    stateBefore: "suggestions", stateAfter: "suggestions", replay: { from: { location: "suggestions" } },
    input: { node: "web.output.dom-extract_list", parameters: { extractList }, consequences: [] }, ...over
  });
  const columns = { handle: "extraction.4", fields: { name: "kName", mutual: "kMutual" } };
  const filtered = read(11, { ...columns, where }, { disposition: "dropped" });
  const listing = read(12, columns);
  // The guard as it stood: step 11's call, on the page it started on, ran and changed nothing.
  const guard = (outcome: AutomationStudioLlmEvidenceRepeatedOutcome["outcome"], held: AutomationStudioFlowDraftStep = filtered) =>
    vi.fn((toolId: string, input: JsonObject, at?: string): AutomationStudioLlmEvidenceRepeatedOutcome | undefined =>
      toolId === "core.run_node" && at === held.stateBefore && automationStudioLlmEvidenceCanonicalJson(input) === automationStudioLlmEvidenceCanonicalJson(held.input) ? { callId: "0022", outcome } : undefined);

  it("is requested, because it changes the kept step, not refused changes_nothing", () => {
    const ranAlready = guard("changed_nothing");
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(12, { extractList: { ...columns, where } })], [filtered, listing], offered, ranAlready);

    expect(resolved.refused).toEqual([]);
    expect(resolved.request).toMatchObject({ step: 12, toolId: "core.run_node", callId: "rerun.12" });
    expect(automationStudioLlmEvidenceCanonicalJson(resolved.request!.input)).toBe(automationStudioLlmEvidenceCanonicalJson(filtered.input));
    // It was asked on step 12's own page, and answered `changed_nothing`: the answer is what was ignored.
    expect(ranAlready).toHaveReturnedWith({ callId: "0022", outcome: "changed_nothing" });
  });

  it("is still refused when it is the identical rerun: the step's own input, which changed nothing there", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(12, { extractList: columns })], [filtered, listing], offered, guard("changed_nothing", listing));

    expect(resolved).toEqual({ request: undefined, refused: [{ step: 12, reason: "changes_nothing" }] });
  });

  it("is still refused when the earlier identical call failed there", () => {
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(12, { extractList: { ...columns, where } })], [filtered, listing], offered, guard("failed"));

    expect(resolved).toEqual({ request: undefined, refused: [{ step: 12, reason: "changes_nothing" }] });
  });

  it("of a press is still refused when the earlier identical press changed nothing there", () => {
    const pressAt = (position: number, target: string): AutomationStudioFlowDraftStep => ({
      ...step(position, "web.dom.click", "core.run_node"), effect: "mutate", effectApplied: false, stateBefore: "suggestions", replay: { from: { location: "suggestions" } },
      input: { node: "web.dom.click", parameters: { target }, consequences: [] }
    });
    const tried = pressAt(11, "Add friend");
    const resolved = automationStudioLlmEvidenceRerunRequest([rerun(12, { parameters: { target: "Add friend" } })], [tried, pressAt(12, "Message")], offered, guard("changed_nothing", tried));

    expect(resolved).toEqual({ request: undefined, refused: [{ step: 12, reason: "changes_nothing" }] });
  });
});

// The same shape through the loop: the read with the where ran first and changed
// nothing on its page, so its call is held; the rerun of the read without it
// must run, from that page, and replace the kept step.
describe("the loop running that rerun", () => {
  it("runs the read with the where in step 2's place, unrefused", async () => {
    const list = { toolId: "list", description: "List records.", inputSchema: { type: "object" }, effect: "observe" as const };
    const where = [{ field: "mutual", atLeast: 5 }];
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => ({
      kind: "llm_evidence_tool_execution" as const, stateDigests: { before: "suggestions", after: "suggestions" },
      evidence: { ok: true, rows: value.where ? 4 : 13 }, effectApplied: true, resultCode: "web.inspect.succeeded",
      draft: { actionId: "web.output.dom-extract_list", effect: "observe" as const, proposes: true }
    }));
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "0022", toolId: "list", input: { list: "suggestions", where }, add: true })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "0024", toolId: "list", input: { list: "suggestions" }, add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { where } }] })
      .mockResolvedValue({ kind: "complete", result: { done: true } });

    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [list], decide, executeTool, unusableDecisions: { stalled: () => new Error("stalled") }, maxIterations: 6, maxToolCalls: 6, dryRun: false });

    expect(executeTool.mock.calls.map(([call]) => call.value)).toEqual([{ list: "suggestions", where }, { list: "suggestions" }, { list: "suggestions", where }]);
    const feedback = (decide.mock.calls[3]![0].evidence as { toolId: string; value: JsonObject }[]).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(JSON.stringify(feedback ?? {})).not.toContain("changes_nothing");
    const kept = result.steps.filter((candidate) => candidate.disposition === "kept");
    expect(kept.map((candidate) => candidate.input)).toContainEqual({ list: "suggestions", where });
    expect(kept.map((candidate) => candidate.input)).not.toContainEqual({ list: "suggestions" });
  });
});
