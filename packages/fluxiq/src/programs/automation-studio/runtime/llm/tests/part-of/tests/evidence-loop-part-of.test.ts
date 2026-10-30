// The plan part a build serves reaches the loop's dry run (K5).
//
// A read whose record output the model left half written is replayed by the loop's completion test. With a part
// that owes records, the replay sends the record output the saved Flow has (the part's columns as the process);
// with no part, or a part that owes none, it sends what it sent before the input existed.
// The loop first: `runtime/loop-limits/` imports back into the llm directory.
import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../../evidence-loop.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../evidence-loop.ts";
import { automationStudioLlmNodeDescriptions } from "../../../node-tools/index.ts";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../../flow-bootstrap/plan/tests/index.ts";
import { authoringScopePartOf } from "../../../../flow-bootstrap/record-defaults/index.ts";

const LIST = "web.output.dom-extract_list";
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const tool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
const parameters: JsonObject = { extractList: { item: ".entry", fields: { title: ".t", price: ".p" } }, recordOutput: { label: "Entries" } };

const owing = authoringScopePartOf([{ id: "p1", words: "Find the entries", columns: ["title", "price"] }]);
const none = authoringScopePartOf([{ id: "p1", words: "Press the button" }]);

/** Runs a loop that reads once and completes, and returns the record output its dry run replayed the read with. */
async function replayedOutput(partOf: typeof owing): Promise<unknown> {
  const sent: JsonObject[] = [];
  const executeTool = async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    if (value.replay === "step") {
      sent.push(value);
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    }
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { page: "after" },
      effectApplied: true,
      draft: {
        actionId: LIST,
        input: value,
        ranWith: { node: LIST, parameters, consequences: [] },
        effect: "observe",
        proposes: true,
        replay: { from: { location: "https://site.test/start" }, produced: { at: 1 } }
      }
    };
  };
  const decide = vi.fn()
    .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: LIST, parameters, consequences: [] }, add: true })
    .mockResolvedValueOnce({ kind: "complete", result: { summary: "Read the entries." } });
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools: [tool], decide, executeTool, propagateDecisionErrors: true, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1,
    nodeOf: automationStudioLlmNodeDescriptions({ registry, resolution }).definition,
    definitionOf: (id: string) => registry.get(id, resolution),
    ...(partOf ? { partOf } : {})
  });
  expect(result.ok).toBe(true);
  expect(sent).toHaveLength(1);
  return (sent[0]!.parameters as JsonObject).recordOutput;
}

describe("the plan part reaches the loop's dry run", () => {
  it("replays a half-written read with the record output the part owes", async () => {
    const output = await replayedOutput(owing) as { process?: { columns?: string[] } };
    expect(output.process).toMatchObject({ columns: ["title", "price"] });
  });

  it("replays it as before with no part, and with a part that owes no records", async () => {
    const before = await replayedOutput(undefined);
    expect(before).not.toHaveProperty("process");
    expect(await replayedOutput(none)).toEqual(before);
  });
});
