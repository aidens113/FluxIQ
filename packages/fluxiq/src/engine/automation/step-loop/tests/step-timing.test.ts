// A Flow run's passes over its nodes, each written as a `flow` step of the step
// log with the step loop's own parts and what the node's dispatch timed inside
// it (task speed S0, S10): a saved Flow's replay runs here, with no tool call
// around it to time it.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { automationStudioLlmStepLogSpans, automationStudioLlmStepLogTool } from "../../../../runtime/llm/step-log/index.ts";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-step-timing-"));
  vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.timed", ownerKind: "routine", ownerId: "routine.timed", name: "Timed", createdAt: 1, updatedAt: 1,
  nodes: [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "press", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "save" } } },
    { id: "done", definitionId: "builtin.control.end" }
  ],
  edges: [
    { id: "e0", sourceNodeId: "start", targetNodeId: "press", sourcePortId: "success", targetPortId: "in" },
    { id: "e1", sourceNodeId: "press", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
  ]
};

/** A dispatcher that times its own send, as the web domain's runtime adapter does. */
const options = (): AutomationStudioGraphExecutionOptions => ({
  delay: async () => undefined,
  hostRuntime: { capabilities: [] },
  effectDispatcher: () => {
    const at = Date.now();
    automationStudioLlmStepLogSpans.record("send.click", at, at + 2, "succeeded");
    return { status: "success", route: "success", outputs: { ok: true } };
  }
});

const meta = (folder: string) => JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as { kind: string; toolId: string; nodeId: string; status: string; spans?: Array<{ name: string }> };

describe("a Flow run's step timing", () => {
  it("writes one flow step per pass over a node, with its arrival, its attempt and the dispatch's own spans", async () => {
    const trace = await runAutomationStudioGraph(flow, options());
    expect(trace.status).toBe("succeeded");
    const folders = readdirSync(directory).filter((name) => name !== "index.md").sort();
    expect(folders).toEqual(["0001-flow-builtin.control.start", "0002-flow-builtin.policy.action", "0003-flow-builtin.control.end"]);
    const press = meta("0002-flow-builtin.policy.action");
    expect(press).toMatchObject({ kind: "flow", toolId: "builtin.policy.action", nodeId: "press", status: "succeeded" });
    expect(press.spans?.map((span) => span.name)).toEqual(expect.arrayContaining(["arrival", "execute", "send.click"]));
  });

  it("writes no flow step inside a tool step, which keeps the dispatch's spans", async () => {
    const tool = automationStudioLlmStepLogTool(async () => await runAutomationStudioGraph(flow, options()));
    await tool({ callId: "c1", toolId: "core.run_node" });
    expect(readdirSync(directory).filter((name) => name !== "index.md")).toEqual(["0001-tool-core.run_node"]);
    expect(meta("0001-tool-core.run_node").spans?.map((span) => span.name)).toEqual(expect.arrayContaining(["dispatch", "send.click"]));
  });
});
