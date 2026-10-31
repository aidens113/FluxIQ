// What one decision is shown: every evidence entry, whole, in call order, and
// beside them the history and the draft, each in full. There is no byte or
// count limit and no ranking (the standing decision of 2026-09-30); the only
// bound is the model's context window, enforced loudly before a request is
// sent, with its measured size (the last block below).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmTaskRequest } from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID, automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "../evidence-recall/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, AutomationStudioLlmDecisionContextRecorder, automationStudioLlmDecisionContextEntry, automationStudioLlmDecisionContextShown } from "../decision-context/index.ts";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const page = (callId: string, size: number, toolId = "inspect"): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId, value: { page: callId, text: "x".repeat(size) } });
const note = (callId: string): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId: "core.request_check", value: { ok: false, code: "llm_evidence_loop.already_answered" } });

describe("the evidence one decision is shown", () => {
  it("is every entry, unchanged and without the loop's bookkeeping", () => {
    const records = [page("call.1", 100), note("core.request_check.2"), page("call.3", 100, "act")];
    const window = automationStudioLlmEvidenceContextWindow(records);
    expect(window).toEqual(records.map(({ callId, toolId, value }) => ({ callId, toolId, value })));
    expect(window.every((entry) => Object.keys(entry).join() === "callId,toolId,value")).toBe(true);
  });

  it("shows 100 entries of 50 KB each, all of them, whole, in call order", () => {
    const records = Array.from({ length: 100 }, (_, index) => page(`call.${index + 1}`, 50_000, index % 3 ? "act" : "inspect"));
    const window = automationStudioLlmEvidenceContextWindow(records);
    expect(window.map((entry) => entry.callId)).toEqual(records.map((record) => record.callId));
    for (const [index, entry] of window.entries()) expect(entry.value).toEqual(records[index]!.value);
    expect(bytes(window)).toBeGreaterThan(5_000_000);
  });

  it("ranks nothing: an older result of a tool is shown where it happened, beside the newer one", () => {
    const records = [page("call.1", 4_000), page("call.2", 10, "other"), page("call.3", 4_000), page("call.4", 10, "other")];
    expect(automationStudioLlmEvidenceContextWindow(records).map((entry) => entry.callId)).toEqual(["call.1", "call.2", "call.3", "call.4"]);
  });
});

// Immutable declared-view/reference oracles follow below. Successor-reference
// expectations were replaced because the first result is already projected.

describe("what one decision is shown beside the evidence", () => {
  const press = (position: number): AutomationStudioFlowDraftStep => ({
    position, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `target.${position}`, note: "n".repeat(5_000) }, effect: "mutate", effectApplied: true, disposition: "kept"
  });

  it("is every entry, then the history in full, then the whole draft, then the budget", () => {
    const evidence = Array.from({ length: 100 }, (_, index) => page(`call.${index + 1}`, 50_000));
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    for (let iteration = 1; iteration <= 60; iteration += 1) {
      recorder.record(iteration, { kind: "call", signature: `s${iteration}`, callId: `call.${iteration}`, toolId: "core.run_node", actionId: `node-${iteration}`, resultCode: "web.action.succeeded", changed: "yes" });
    }
    const steps = Array.from({ length: 60 }, (_, index) => press(index + 1));
    const budgetEntry = { callId: "core.budget", toolId: "core.budget", value: { decisionsLeft: 3 } };
    const { shown, draftShown } = automationStudioLlmDecisionContextShown({ evidence, records: recorder.records(), draft: { steps }, budgetEntry });

    expect(shown).toHaveLength(103);
    expect(shown.slice(0, 100).map((entry) => entry.callId)).toEqual(evidence.map((entry) => entry.callId));
    const history = shown[100]!;
    expect(history.toolId).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID);
    expect(history).toEqual(automationStudioLlmDecisionContextEntry({ records: recorder.records() }));
    expect((history.value as { rows: unknown[] }).rows).toHaveLength(60);
    const draft = shown[101]!.value as { steps: { step: number; input: unknown }[]; omitted?: unknown; unlisted?: unknown };
    expect(draft.steps.map((line) => line.step)).toEqual(steps.map((line) => line.position));
    expect(draft.steps.map((line) => line.input)).toEqual(steps.map((line) => line.input));
    expect(draft).not.toHaveProperty("omitted");
    expect(draft).not.toHaveProperty("unlisted");
    expect(draftShown).toMatchObject({ steps: 60, budget: draftShown!.bytes });
    expect(shown[102]).toEqual(budgetEntry);
  });
});

// The one size limit on a request: the model's context window. A request over
// it is refused before it is sent, loudly, with its measured size, and nothing
// is ever trimmed to make it fit.
const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
const tools = [{ toolId: "web.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };
/** A page of prose past a million tokens at any estimate Core makes. */
const hugePage = (): JsonObject => ({ schemaVersion: "web-llm-evidence.v2", text: "word ".repeat(840_000) });

function countedProvider() {
  const calls = { secrets: 0, transport: 0 };
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => { calls.secrets += 1; return "test-secret"; },
    fetchImpl: (async () => { calls.transport += 1; throw new Error("must not be sent"); }) as typeof fetch
  });
  return { provider, calls };
}

describe("a request over the model's context window", () => {
  it("is refused by the harness before any provider call, with its estimated tokens, its bytes and the window", async () => {
    const { provider, calls } = countedProvider();
    const result = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: [],
      tokenLimits: WINDOW,
      evidenceLoop: { iteration: 2, tools, evidence: [{ callId: "call.1", toolId: "web.inspect", value: hugePage() }], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      provider
    });
    expect(result.ok).toBe(false);
    expect(result.providerInvocation).toBe("not_attempted");
    expect(calls).toEqual({ secrets: 0, transport: 0 });
    const refused = result.diagnostics.find((diagnostic) => diagnostic.code === "llm_budget.input_limit_exceeded");
    expect(refused?.message).toMatch(/^Packed LLM request is an estimated \d+ input tokens \(\d+ bytes\), over its 992000-token input limit: the 1000000-token context window less 8000 reserved for the reply\. It was not sent, and nothing was trimmed to fit\.$/u);
    expect(refused?.metadata).toMatchObject({ maxInputTokens: 992_000, maxTotalTokens: 1_000_000 });
    expect((refused?.metadata?.estimatedInputTokens as number)).toBeGreaterThan(1_000_000);
    expect((refused?.metadata?.estimatedInputBytes as number)).toBeGreaterThan(4_000_000);
    // The evidence the request was built from went into it whole.
    expect(JSON.stringify(result.request.context.evidenceLoop?.evidence[0]?.value)).toBe(JSON.stringify(hugePage()));
  });

  it("is refused by the DeepSeek adapter with its measured size and the model's window, never sent", async () => {
    const { provider, calls } = countedProvider();
    const built = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: [],
      tokenLimits: WINDOW,
      evidenceLoop: { iteration: 2, tools, evidence: [{ callId: "call.1", toolId: "web.inspect", value: hugePage() }], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      dryRun: true
    });
    // The request Core builds, with a caller's claim of its size that is far too
    // low: the adapter measures the body itself.
    const request: AutomationStudioLlmTaskRequest = { ...built.request, estimatedInputTokens: 100 };
    const failure = await provider.runTask(request).then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AutomationStudioLlmProviderError);
    expect((failure as AutomationStudioLlmProviderError).code).toBe("llm.provider_input_budget_exceeded");
    expect((failure as Error).message).toMatch(/^Outbound request is an estimated \d+ input tokens \(\d+ bytes\) plus 8000 reserved for the reply, over its 992000-token input or 1000000-token total limit; deepseek-flash's context window is 1000000 tokens\. It was not sent, and nothing was trimmed to fit\.$/u);
    expect(calls).toEqual({ secrets: 0, transport: 0 });
  });

  it("ends the build failed, with that message", async () => {
    const { provider, calls } = countedProvider();
    const build = runAutomationStudioLlmEvidenceLoop({
      tools,
      completionSchema,
      propagateDecisionErrors: true,
      executeTool: async () => hugePage(),
      decide: async ({ iteration, tools: offered, evidence, decisionSchema, canComplete }) => {
        if (iteration === 1) return { kind: "tool_call", callId: "call.1", toolId: "web.inspect", input: {} };
        const result = await runAutomationStudioLlmHarness({
          taskKind: "evidence_tool_decision",
          projectId: "project.one",
          flowId: "flow.one",
          instructions: [],
          deniedEvidenceKeys: [],
          tokenLimits: WINDOW,
          evidenceLoop: { iteration, tools: offered, evidence: [...evidence], decisionSchema, completionSchema, canComplete },
          provider
        });
        if (!result.ok) throw new Error(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join(" "));
        return result.response;
      }
    });
    await expect(build).rejects.toThrow(/llm_budget\.input_limit_exceeded: Packed LLM request is an estimated \d+ input tokens \(\d+ bytes\), over its 992000-token input limit: the 1000000-token context window/u);
    expect(calls).toEqual({ secrets: 0, transport: 0 });
  });
});

// One current Flow in what a decision is shown (t498), named once, at the end
// (t501, t503). An entry once shown is never rewritten, because the provider
// caches a request by its byte prefix (live runs `run-mv6i27oi-a87fb247` W5,
// `run-mv6i2akr-516b2f03` D3). Each submission is labelled by what it was when
// it was written, never as current; one Core entry after every result,
// `core.current_flow`, names the newest accepted revision (lane C round 17,
// `run-mv6lgqi6-4bfab2e1`: four scripts each calling itself current).
const accepted = (callId: string, revision: number, body: JsonObject = { script: `flow: revision ${revision}` }): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId: "core.submit_candidate", value: { ok: true, status: "draft", revision, digest: `${revision}`.repeat(64), ...body, scriptIs: `Revision ${revision}, as Core accepted it.`, next: "Test next." } });
const refused = (callId: string, revision: number, latest?: number): AutomationStudioLlmEvidenceEntry =>
  ({ callId, toolId: "core.submit_candidate", value: { ok: false, revision, diagnostics: { code: "flow_bootstrap.completion_refused", issues: [], previous: `flow: refused ${revision}`, instruction: "Correct it." }, issueCodes: ["x.y"], next: "Correct it.",
    ...(latest === undefined ? {} : { latestAcceptedWhenSent: { revision: latest, digest: "d", call: `submit.${latest}` }, scriptIs: "This submission was refused." }) } });
const look = (callId: string): AutomationStudioLlmEvidenceEntry => ({ callId, toolId: "demo.look", value: { script: "a page's own key", ok: true } });
const currentOf = (window: readonly AutomationStudioLlmEvidenceEntry[]) => window.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID);

describe("a candidate's scripts in the window", () => {
  it("never rewrites an earlier entry when a new revision is accepted: every result before the new entry is byte for byte the same", () => {
    const before = [accepted("submit.1", 1), look("look.2"), refused("submit.3", 3, 1), look("look.4")];
    const after = [...before, accepted("submit.5", 5)];
    const shownBefore = automationStudioLlmEvidenceContextWindow(structuredClone(before));
    const shownAfter = automationStudioLlmEvidenceContextWindow(structuredClone(after));
    expect(JSON.stringify(shownAfter.slice(0, before.length))).toBe(JSON.stringify(shownBefore.slice(0, before.length)));
    // And once more, after a later look and another accepted revision.
    const later = [...after, look("look.6"), accepted("submit.7", 7)];
    expect(JSON.stringify(automationStudioLlmEvidenceContextWindow(structuredClone(later)).slice(0, after.length))).toBe(JSON.stringify(shownAfter.slice(0, after.length)));
  });

  it("appends one entry, last, naming the newest accepted submission as the current Flow, and changes no submission", () => {
    const records = [accepted("submit.1", 1), refused("submit.2", 2, 1), accepted("submit.3", 3), refused("submit.4", 4, 3), look("look.5")];
    const before = structuredClone(records);
    const window = automationStudioLlmEvidenceContextWindow(records);
    expect(window.slice(0, records.length)).toEqual(before);
    expect(currentOf(window)).toHaveLength(1);
    expect(window.at(-1)).toMatchObject({ callId: "core.current_flow", toolId: "core.current_flow", value: { revision: 3, digest: "3".repeat(64), call: "submit.3" } });
    const instruction = String((window.at(-1)!.value as JsonObject).instruction);
    expect(instruction).toContain(`Revision 3 (digest ${"3".repeat(64)}) is your current Flow: its whole script is under script in the core.submit_candidate result of call submit.3.`);
    expect(instruction).toMatch(/never start from one of them/u);
    // Only that entry calls anything current, and the loop's own records are never changed.
    expect(window.filter((entry) => JSON.stringify(entry.value).includes("current Flow")).map((entry) => entry.callId)).toEqual(["core.current_flow"]);
    expect(records).toEqual(before);
  });

  it("names a plan as the current Flow's whole plan, and reads only accepted submissions carrying a script or plan", () => {
    const planned = automationStudioLlmEvidenceContextWindow([accepted("submit.1", 1), accepted("submit.2", 2, { plan: { schemaVersion: "0.1" } }), look("look.3")]);
    expect(planned.at(-1)!.value).toMatchObject({ revision: 2, call: "submit.2" });
    expect(String((planned.at(-1)!.value as JsonObject).instruction)).toContain("its whole plan is under plan");
    const bare = automationStudioLlmEvidenceContextWindow([accepted("submit.1", 1), accepted("submit.2", 2, { script: undefined as unknown as string })]);
    expect(bare.at(-1)!.value).toMatchObject({ revision: 1, call: "submit.1" });
    expect(JSON.stringify(planned)).not.toContain("supersededBy");
    expect(JSON.stringify(planned)).not.toContain("supersedes");
  });

  it("adds nothing where no submission was accepted", () => {
    const records = [refused("submit.1", 1), refused("submit.2", 2)];
    expect(automationStudioLlmEvidenceContextWindow(records)).toEqual(records);
  });
});

// Append-only historical projection, full dynamic views and raw recall safety.

const keys = ["page", "elements", "read.rows", "read.rejected"];
const entry = (callId: string, value: JsonObject, toolId = "core.run_node"): AutomationStudioLlmEvidenceEntry => ({ callId, toolId, value });
const reference = (callId: string, group: string) => ({ "core.view_reference": { callId, group } });
const utf8 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
const groups = (window: AutomationStudioLlmEvidenceEntry[]) => (window.find(({ toolId }) => toolId === "core.current_view")!.value as { groups: JsonObject[] }).groups;
const read = (callId: string) => entry(callId, {
  ok: true,
  page: { title: `page-${callId}`, text: "???".repeat(300) },
  read: { action: "read", rows: [{ name: `row-${callId}-1` }, { name: `row-${callId}-2` }], count: 2, rejected: [], firstRows: [{ name: `summary-${callId}` }] },
  inFlow: true
});
const recall = (callId: string, original: string) => entry(callId, { ok: true, of: original, restored: { read: { rows: [{ name: `restored-${original}` }] } } }, AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID);

function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const member of Object.values(value)) frozen(member);
    Object.freeze(value);
  }
  return value;
}

describe("immutable view history from its first appearance", () => {
  it("projects the very first result in place, preserving non-view keys, values and their order", () => {
    const raw = entry("a", { before: "kept", page: { title: "whole" }, middle: { nested: { page: "undeclared" } }, elements: [], supersededBy: "client metadata", "core.view_reference": "client field", after: 3 });
    const before = utf8(raw);
    const window = automationStudioLlmEvidenceContextWindow(frozen([raw]), keys);
    expect(window[0]!.value).toEqual({ before: "kept", page: reference("a", "top"), middle: { nested: { page: "undeclared" } }, elements: reference("a", "top"), supersededBy: "client metadata", "core.view_reference": "client field", after: 3 });
    expect(Object.keys(window[0]!.value as JsonObject)).toEqual(Object.keys(raw.value as JsonObject));
    expect(groups(window)).toEqual([{ group: "top", callId: "a", value: { page: { title: "whole" }, elements: [] } }]);
    expect(utf8(raw)).toEqual(before);
  });

  it("keeps every historical UTF-8 byte when views replace, appear later, interleave, or are recalled", () => {
    const log = frozen([
      read("read-1"),
      entry("route-1", { state: { path: "/?" } }, "core.route_state"),
      entry("refused", { ok: false, code: "blocked", detail: { elements: ["nested"] } }),
      entry("page-2", { page: { title: "changed" }, read: { action: "press", message: "done" } }),
      recall("recall-1", "read-1"),
      read("read-2"),
      entry("other", { matches: 3 }),
      recall("recall-2", "read-2"),
      entry("empty", { read: { rows: [], count: 0 } }),
      entry("late", { elements: ["new group member"] })
    ]);
    const raw = utf8(log);
    for (let count = 1; count < log.length; count += 1) {
      const before = automationStudioLlmEvidenceContextWindow(log.slice(0, count), keys);
      const after = automationStudioLlmEvidenceContextWindow(log.slice(0, count + 1), keys);
      expect(utf8(after.slice(0, count)), `history after ${count}`).toEqual(utf8(before.slice(0, count)));
      expect(after.slice(0, count).map(({ callId }) => callId)).toEqual(log.slice(0, count).map(({ callId }) => callId));
    }
    expect(utf8(log)).toEqual(raw);
  });

  it("shows the latest whole page and rows once and keeps each holder's metadata whole", () => {
    const raw = [read("r1"), read("r2"), entry("p3", { page: { title: "newest-page" }, elements: ["newest-control"] })];
    const window = automationStudioLlmEvidenceContextWindow(raw, keys);
    expect(window.map(({ callId }) => callId)).toEqual(["r1", "r2", "p3", "core.current_view"]);
    expect(groups(window)).toEqual([
      { group: "top", callId: "p3", value: { page: { title: "newest-page" }, elements: ["newest-control"] } },
      { group: "holder:read", callId: "r2", holder: "read", value: { rows: [{ name: "row-r2-1" }, { name: "row-r2-2" }], rejected: [] } }
    ]);
    const historical = window[1]!.value as JsonObject;
    expect(historical.read).toEqual({ action: "read", rows: reference("r2", "holder:read"), count: 2, rejected: reference("r2", "holder:read"), firstRows: [{ name: "summary-r2" }] });
    expect(Object.keys(historical.read as JsonObject)).toEqual(Object.keys((raw[1]!.value as JsonObject).read as JsonObject));
    const serialized = JSON.stringify(window);
    for (const unique of ["newest-page", "newest-control", "row-r2-1", "row-r2-2"]) expect(serialized.split(unique)).toHaveLength(2);
    expect(serialized).not.toContain("row-r1-1");
    expect(serialized).toContain("summary-r1");
    expect((raw[0]!.value as JsonObject).read).toEqual((read("r1").value as JsonObject).read);
  });

  it("replaces each group as a whole, including empty or null members, and never invents absent members", () => {
    const raw = [read("r1"), entry("r2", { read: { rejected: null, count: 0 } }), entry("p3", { page: null })];
    expect(groups(automationStudioLlmEvidenceContextWindow(raw, keys))).toEqual([
      { group: "top", callId: "p3", value: { page: null } },
      { group: "holder:read", callId: "r2", holder: "read", value: { rejected: null } }
    ]);
    const empty = automationStudioLlmEvidenceContextWindow([...raw, entry("r4", { read: { rows: [] } })], keys);
    expect(groups(empty)[1]).toEqual({ group: "holder:read", callId: "r4", holder: "read", value: { rows: [] } });
  });

  it("keeps overlapping top holders and independent rows without duplication through partial updates", () => {
    const overlapKeys = ["page", "read", "read.rows"];
    const log = [
      entry("a", { page: "first", read: { rows: [{ id: "old-row" }], count: 1, label: "initial" } }),
      entry("b", { page: "page-only" }),
      entry("c", { read: { count: 7, label: "metadata-only" } }),
      entry("d", { read: { rows: [{ id: "new-row" }], count: 1, label: "new-metadata" } })
    ];
    const first = automationStudioLlmEvidenceContextWindow(log.slice(0, 1), overlapKeys);
    expect(groups(first)).toEqual([
      { group: "top", callId: "a", value: { page: "first", read: { rows: reference("a", "holder:read"), count: 1, label: "initial" } } },
      { group: "holder:read", callId: "a", holder: "read", value: { rows: [{ id: "old-row" }] } }
    ]);
    const afterPage = automationStudioLlmEvidenceContextWindow(log.slice(0, 2), overlapKeys);
    expect(groups(afterPage)).toEqual([
      { group: "top", callId: "b", value: { page: "page-only" } },
      { group: "holder:read", callId: "a", holder: "read", value: { rows: [{ id: "old-row" }] } }
    ]);
    const afterMetadata = automationStudioLlmEvidenceContextWindow(log.slice(0, 3), overlapKeys);
    expect(groups(afterMetadata)).toEqual([
      { group: "top", callId: "c", value: { read: { count: 7, label: "metadata-only" } } },
      { group: "holder:read", callId: "a", holder: "read", value: { rows: [{ id: "old-row" }] } }
    ]);
    const final = automationStudioLlmEvidenceContextWindow(log, overlapKeys);
    expect(groups(final)).toEqual([
      { group: "top", callId: "d", value: { read: { rows: reference("d", "holder:read"), count: 1, label: "new-metadata" } } },
      { group: "holder:read", callId: "d", holder: "read", value: { rows: [{ id: "new-row" }] } }
    ]);
    expect(JSON.stringify(final).split("new-row")).toHaveLength(2);
    expect(JSON.stringify(final)).not.toContain("old-row");
    expect(utf8(final.slice(0, 3))).toEqual(utf8(afterMetadata.slice(0, 3)));
    const top = groups(final)[0]!.value as JsonObject;
    const held = groups(final)[1]!.value as JsonObject;
    expect({ ...(top.read as JsonObject), ...held }).toEqual({ rows: [{ id: "new-row" }], count: 1, label: "new-metadata" });
  });

  it("keeps recalled restored views separate from the current client views and keeps recall metadata", () => {
    const raw = frozen([read("r1"), read("r2"), recall("c1", "r1"), recall("c2", "r1")]);
    const window = automationStudioLlmEvidenceContextWindow(raw, keys);
    const group = `tool:${AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID}:restored`;
    expect(window[2]!.value).toEqual({ ok: true, of: "r1", restored: reference("c1", group) });
    expect(window[3]!.value).toEqual({ ok: true, of: "r1", restored: reference("c2", group) });
    expect(groups(window).map(({ callId }) => callId)).toEqual(["r2", "r2", "c2"]);
    expect(groups(window)[2]).toEqual({ group, callId: "c2", value: { restored: { read: { rows: [{ name: "restored-r1" }] } } } });
    expect((raw[2]!.value as JsonObject).restored).toEqual({ read: { rows: [{ name: "restored-r1" }] } });
  });

  it("does not treat ordinary restored data as a Core recall", () => {
    const raw = [entry("a", { restored: [1], page: "page" })];
    expect(automationStudioLlmEvidenceContextWindow(raw, keys)[0]!.value).toEqual({ restored: [1], page: reference("a", "top") });
  });

  it("keeps undeclared, invalid, missing, nested and non-object holders whole without inventing a view", () => {
    const raw: AutomationStudioLlmEvidenceEntry[] = [
      entry("a", { rows: [1], read: "not an object", detail: { read: { rows: [3] } } }),
      entry("b", { read: {}, payload: { page: "nested" } }),
      { callId: "c", toolId: "x", value: null },
      { callId: "d", toolId: "x", value: [1, 2] }
    ];
    expect(automationStudioLlmEvidenceContextWindow(raw, ["read.rows", "a.b.c", ".x", "x."])).toEqual(raw);
    expect(automationStudioLlmEvidenceContextWindow([read("a"), read("b"), recall("c", "a")])).toEqual([read("a"), read("b"), recall("c", "a")]);
    const pageOnly = automationStudioLlmEvidenceContextWindow([read("a"), read("b")], ["page"]);
    expect((pageOnly[0]!.value as JsonObject).read).toEqual((read("a").value as JsonObject).read);
  });

  it("keeps all large current view members, with no cap, sample or summary", () => {
    const rows = Array.from({ length: 1000 }, (_, id) => ({ id, text: "?".repeat(100) }));
    const payload = { page: "x".repeat(50_000), read: { rows } };
    const window = automationStudioLlmEvidenceContextWindow([entry("a", payload)], keys);
    expect(groups(window)[0]!.value).toEqual({ page: payload.page });
    expect(groups(window)[1]!.value).toEqual({ rows });
  });

  it("keeps a long build to one full view and stable references per result", () => {
    const log = Array.from({ length: 30 }, (_, index) => entry(`call.${index}`, { ok: true, control: `pressed-${index}`, page: "x".repeat(2000) }));
    const whole = utf8(automationStudioLlmEvidenceContextWindow(log));
    const projected = automationStudioLlmEvidenceContextWindow(log, ["page"]);
    expect(whole.length).toBeGreaterThan(30 * 2000);
    expect(utf8(projected).length).toBeLessThan(utf8(log[0]).length + 30 * 200);
    expect(groups(projected)).toEqual([{ group: "top", callId: "call.29", value: { page: "x".repeat(2000) } }]);
  });

  it("orders current view before current Flow, history, draft and budget, keeping accepted/refused results stable", () => {
    const submit = (callId: string, revision: number, ok: boolean) => entry(callId, { ok, revision, digest: `d${revision}`, script: `whole-${revision}` }, "core.submit_candidate");
    const before = [read("r1"), submit("s1", 1, true), submit("s2", 2, false)];
    const after = [...before, submit("s3", 3, true), entry("page", { page: "latest" })];
    const shownBefore = automationStudioLlmEvidenceContextWindow(before, keys);
    const shownAfter = automationStudioLlmEvidenceContextWindow(after, keys);
    expect(utf8(shownAfter.slice(0, before.length))).toEqual(utf8(shownBefore.slice(0, before.length)));
    expect(shownBefore.at(-1)!.value).toMatchObject({ revision: 1, call: "s1" });
    expect(shownAfter.at(-1)!.value).toMatchObject({ revision: 3, call: "s3" });
    const recorder = new AutomationStudioLlmDecisionContextRecorder();
    recorder.record(1, { kind: "call", signature: "read-signature", callId: "r1", toolId: "core.run_node", actionId: "read", resultCode: "read.succeeded", changed: "yes" });
    const step: AutomationStudioFlowDraftStep = { position: 1, iteration: 1, callId: "r1", actionId: "press", input: {}, effect: "mutate", effectApplied: true, disposition: "kept" };
    const { shown } = automationStudioLlmDecisionContextShown({ evidence: after, records: recorder.records(), observedStateKeys: keys, draft: { steps: [step] }, budgetEntry: entry("budget", { left: 1 }, "core.budget") });
    expect(shown.slice(after.length).map(({ toolId }) => toolId)).toEqual(["core.current_view", "core.current_flow", "core.evidence_history", "core.flow_draft", "core.budget"]);
  });
});
