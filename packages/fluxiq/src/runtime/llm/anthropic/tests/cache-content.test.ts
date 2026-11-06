// What Anthropic's prompt cache can read back of one decision's request (t869).
//
// Across a real run the cached part stayed at about 15K tokens while up to 50K went
// uncached on every call, though most calls only added to the history
// (`run-mw37vz9n-a77a02c2`): the marker sat on an entry that changes every call. The
// requests here are the ones a real loop asks for, with a draft, a budget and Core's
// notes coming and going, and are held to what a prefix cache needs.
import { describe, expect, it, vi } from "vitest";
import { automationStudioLlmEvidenceEntryMoves } from "../../evidence-moves/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopDecision } from "../../evidence-loop.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmTaskMessages } from "../../provider-task/index.ts";
import { automationStudioFlowDraftEntry } from "../../../flow-authoring/draft/index.ts";
import { automationStudioAnthropicRequest } from "../request.ts";
import { decisionRequest } from "./fixtures.ts";

type Block = { text: string; cache_control?: unknown };
type Wire = { system: Block[]; messages: Array<{ content: Block[] }>; cache_control?: unknown };

const wireOf = (task: AutomationStudioLlmTaskRequest): Wire => JSON.parse(automationStudioAnthropicRequest(task, "claude-sonnet-5-5").body) as Wire;
const blocksOf = (wire: Wire): Block[] => [...wire.system, ...wire.messages[0]!.content];
const textOf = (blocks: readonly Block[]): string => blocks.map((block) => block.text).join("");
const markedIndexes = (blocks: readonly Block[]): number[] => blocks.flatMap((block, index) => block.cache_control ? [index] : []);
/** The evidence entry a block holds, when it holds one. */
const entryOf = (block: Block): { callId: string; toolId: string } | undefined => {
  try { return JSON.parse(block.text.replace(/^,/u, "")) as { callId: string; toolId: string }; } catch { return undefined; }
};

type Entries = NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]>["evidence"];

function requestWith(evidence: Entries, iteration = 1): AutomationStudioLlmTaskRequest {
  const task = decisionRequest();
  task.context.evidenceLoop!.evidence = evidence;
  task.context.evidenceLoop!.iteration = iteration;
  return task;
}

/** What each decision of one scripted loop asks to send: calls, a refused completion and amendment, a repeat, and the notes they leave. */
async function requestsOfALoop(declared: { draft?: Record<string, never> } = { draft: {} }): Promise<AutomationStudioLlmTaskRequest[]> {
  // The opening look a build begins with, as a real one does: completion is on offer from the first decision.
  const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", effect: "mutate" as const, perCallEffect: true, inputSchema: { type: "object" }, initialObservation: { input: { page: 0 } } }];
  const script = [
    { kind: "tool_call", callId: "call.1", toolId: "inspect", input: { page: 1 } },
    { kind: "tool_call", callId: "call.2", toolId: "inspect", input: { page: 2 } },
    { kind: "complete", result: { plan: 1 } },
    { kind: "amend_draft", amendments: [{ step: 99, change: "drop" }] },
    { kind: "tool_call", callId: "call.3", toolId: "inspect", input: { page: 3 } },
    { kind: "complete", result: { plan: 2 } },
    { kind: "tool_call", callId: "call.4", toolId: "inspect", input: { page: 4 } },
    { kind: "tool_call", callId: "call.4b", toolId: "inspect", input: { page: 4 } },
    { kind: "tool_call", callId: "call.5", toolId: "inspect", input: { page: 5 } },
    { kind: "complete", result: { plan: 3 } }
  ] as unknown as AutomationStudioLlmEvidenceLoopDecision[];
  let completions = 0;
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const decide = vi.fn(async ({ iteration, tools: offered, evidence, decisionSchema, canComplete }: Parameters<Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0]["decide"]>[0]) => {
    const task = requestWith(evidence.map((entry) => ({ ...entry })), iteration);
    const loop = task.context.evidenceLoop!;
    loop.tools = [...offered];
    loop.decisionSchema = decisionSchema;
    loop.canComplete = canComplete;
    requests.push(task);
    return script[requests.length - 1]!;
  });
  await runAutomationStudioLlmEvidenceLoop({
    // It declares a draft, as a build's and an attempt's rounds do: only such a loop holds the amending vocabulary in its head, and a loop that builds no Flow offers it once a step can be amended (`../../evidence-loop.ts`, f34f16d74), which the test below holds apart.
    ...declared,
    tools, decide, maxIterations: 30, maxToolCalls: 30, completionSchema: { type: "object" }, budget: { maxTotalTokens: 10_000_000 },
    unusableDecisions: { stalled: () => new Error("stalled") },
    checkCompletion: () => (completions += 1) < 3 ? { ok: false, issueCodes: ["plan.cannot_answer"], feedback: { issue: "plan.cannot_answer" } } : { ok: true },
    executeTool: async ({ value }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: value.page ?? null, text: "x".repeat(600) }, effectApplied: true, draft: { actionId: "inspect", input: value, effect: "mutate" as const, proposes: true } })
  });
  return requests;
}

describe("the marked prefix of a decision's request", () => {
  it("is byte for byte the next request's start, up to the previous marker, across every kind of note", async () => {
    const requests = await requestsOfALoop();
    expect(requests.length).toBeGreaterThanOrEqual(8);
    const shownKinds = new Set(requests.flatMap((task) => task.context.evidenceLoop!.evidence.map((entry) => entry.toolId)));
    // The script reaches what used to rewrite the history, or this would hold for no reason.
    for (const kind of ["core.completion_check", "core.amendment_check", "core.flow_draft", "core.budget", "core.evidence_history"]) expect(shownKinds, kind).toContain(kind);
    let hits = 0;
    for (let index = 1; index < requests.length; index += 1) {
      const before = blocksOf(wireOf(requests[index - 1]!));
      const after = textOf(blocksOf(wireOf(requests[index]!)));
      const lastMarked = markedIndexes(before).at(-1)!;
      if (after.startsWith(textOf(before.slice(0, lastMarked + 1)))) hits += 1;
      else throw new Error(`Decision ${index + 1} does not start with what decision ${index} marked.`);
    }
    expect(hits).toBe(requests.length - 1);
  });

  it("keeps the whole decision schema fixed where a draft is declared, and leaves a loop that declares none its old rule", async () => {
    const schemas = (requests: AutomationStudioLlmTaskRequest[]) => new Set(requests.map((task) => JSON.stringify(task.context.evidenceLoop!.decisionSchema))).size;
    expect(schemas(await requestsOfALoop())).toBe(1);
    // A recovery's exploration builds no Flow, so the amending vocabulary comes and goes with its offer, and its head moves when it does.
    expect(schemas(await requestsOfALoop({}))).toBeGreaterThan(1);
  });

  it("never marks an entry that moves, marks the head and the last settled entry, and uses at most four markers", async () => {
    for (const task of await requestsOfALoop()) {
      const wire = wireOf(task);
      expect(wire).not.toHaveProperty("cache_control");
      const blocks = blocksOf(wire);
      expect(markedIndexes(blocks).length).toBeLessThanOrEqual(4);
      expect(wire.system[0]).toHaveProperty("cache_control");
      const content = wire.messages[0]!.content;
      expect(content[0]).toHaveProperty("cache_control");
      for (const block of content.slice(1).filter((each) => each.cache_control)) {
        const entry = entryOf(block);
        expect(entry, block.text.slice(0, 60)).toBeDefined();
        expect(automationStudioLlmEvidenceEntryMoves(entry!), entry!.callId).toBe(false);
      }
      // The last entry before the first that moves: nothing settled is left behind it.
      const firstMoving = content.findIndex((block, index) => index > 0 && entryOf(block) !== undefined && automationStudioLlmEvidenceEntryMoves(entryOf(block)!));
      const lastMarked = markedIndexes(content).at(-1)!;
      expect(lastMarked).toBe(firstMoving === -1 ? content.length - 2 : firstMoving - 1);
    }
  });

  it("changes no byte of what is sent: the blocks concatenate to the shared projection", async () => {
    for (const task of await requestsOfALoop()) {
      expect(textOf(wireOf(task).messages[0]!.content)).toBe(automationStudioLlmTaskMessages(task)[1]!.content);
    }
  });

  it("still reaches what the last request marked when more than 20 entries were added since", () => {
    // Each breakpoint looks back 20 blocks, itself included. A dry run can add many entries in one go.
    const settled = (count: number) => Array.from({ length: count }, (_, index) => ({ callId: `call.${index + 1}`, toolId: "inspect", value: { page: index + 1 } }));
    const tail = [{ callId: "core.current_view", toolId: "core.current_view", value: { now: 1 } }, { callId: "core.budget.3", toolId: "core.budget", value: { left: 3 } }];
    for (const added of [1, 19, 20, 21, 30, 38]) {
      const before = wireOf(requestWith([...settled(4), ...tail])).messages[0]!.content;
      const after = wireOf(requestWith([...settled(4 + added), ...tail])).messages[0]!.content;
      const previous = markedIndexes(before).at(-1)!;
      const reached = markedIndexes(after).some((marker) => marker >= previous && marker - previous < 20);
      expect(reached, `${added} entries added`).toBe(true);
      expect(textOf(after).startsWith(textOf(before.slice(0, previous + 1)))).toBe(true);
    }
  });

  it("marks only the head when nothing has settled yet, and leaves one-call requests to the system marker", () => {
    const content = wireOf(requestWith([{ callId: "core.budget.1", toolId: "core.budget", value: { left: 3 } }])).messages[0]!.content;
    expect(markedIndexes(content)).toEqual([0]);
    const { evidenceLoop: _none, ...withoutLoop } = decisionRequest().context;
    const oneCall = JSON.parse(automationStudioAnthropicRequest({ ...decisionRequest(), taskKind: "runtime_diagnosis", context: withoutLoop }, "claude-sonnet-5-5").body) as { messages: Array<{ content: unknown }>; cache_control?: unknown };
    expect(typeof oneCall.messages[0]!.content).toBe("string");
    expect(oneCall).not.toHaveProperty("cache_control");
  });

  it("sends the draft's guide in the marked head and its steps after the marker", () => {
    const draft = automationStudioFlowDraftEntry({ steps: [{ position: 1, iteration: 1, callId: "call.1", actionId: "press", input: { target: "t1" }, effect: "mutate", effectApplied: true, disposition: "kept" }], authored: true })!;
    const [head, settled, moving] = wireOf(requestWith([{ callId: "call.1", toolId: "core.run_node", value: { ok: true } }, draft])).messages[0]!.content;
    expect(head!.text).toContain("flowDraftGuide");
    expect(head).toHaveProperty("cache_control");
    expect(settled).toHaveProperty("cache_control");
    expect(moving!.text).toContain('"toolId":"core.flow_draft"');
    expect(moving).not.toHaveProperty("cache_control");
  });

});
