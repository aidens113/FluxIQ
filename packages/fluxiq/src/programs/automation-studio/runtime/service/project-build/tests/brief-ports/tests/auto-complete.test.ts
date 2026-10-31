// The production brief observer must keep the builder's Core completion
// wrapper while binding its final completion schema to provider decisions.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../../../flow-bootstrap/site-reset/index.ts";
import { automationStudioSubflowBuilderAutoComplete } from "../../../../../flow-bootstrap/subflow-submit-then/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../../llm/index.ts";
import type { AutomationStudioProjectBriefPortRequest } from "../../../../../project-agents/index.ts";
import { automationStudioProjectBuildBriefPorts } from "../../../brief-ports.ts";

vi.mock("../../../../../llm/index.ts", async (original) => ({
  ...(await original<object>()),
  automationStudioLlmNodeDescriptions: () => ({ ids: () => [], definition: () => undefined }),
  automationStudioHarnessOptionRegistry: () => ({ evidenceLoopBinding: () => ({ tools: [], observedStateKeys: [], executeTool: async () => ({ ok: true }) }) })
}));
vi.mock("../../../phase-start.ts", () => ({
  AutomationStudioProjectBuildPhaseStart: class {
    reset() { return { beforeTrial: async () => ({}), trialRan: () => [] }; }
    async explore() { return { record: {}, entry: { kind: "start" }, told: undefined }; }
  }
}));

describe("the production builder decision observer", () => {
  it("keeps Core's completion and still gives provider calls the builder's late schema", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const schemas: Array<JsonObject | undefined> = [];
    const provider = vi.fn(async () => ({ kind: "complete", result: {} }));
    const binding = { domainId: "example", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({}), startState: async () => ({ state: {}, differs: [] }) };
    const factory = automationStudioProjectBuildBriefPorts({
      project: { ledger, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute }, permissions: { permittedConsequences: [], instructionIds: [] }, trialEnvironment: {}, runHarness: async () => ({}) },
      draft: { submission: { projectId: "project", flowId: "flow", resolution: {}, instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
      decisions: { decide: (input: { completionSchema: JsonObject | undefined }) => {
        schemas.push(input.completionSchema);
        return provider;
      } },
      subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
    } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
    const request = {
      brief: { briefId: "brief.1", kind: "build", subflowKey: "keep", parts: [], permittedActs: [], maxIterations: 4 },
      scope: { buildId: "build.1", briefId: "brief.1", planDigest: "plan.1", subflowKey: "keep", predecessors: [], parts: [] },
      ledger: ledger.forBrief("brief.1"), lease: {}, signal: new AbortController().signal
    } as unknown as AutomationStudioProjectBriefPortRequest;
    const ports = await factory.builder(request);
    const schema: JsonObject = { type: "object", required: ["subflowKey", "revision", "digest"] };
    const receipt = { subflowKey: "keep", revision: 1, digest: "d".repeat(64) };
    let ready = false;
    const observed = ports.observe!({
      ...ports.loop, completionSchema: schema,
      decide: automationStudioSubflowBuilderAutoComplete(ports.loop.decide, () => ready ? receipt : undefined)
    });
    const turn: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0] = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
    await observed.decide(turn);
    expect(schemas.at(-1)).toEqual(schema);
    expect(provider).toHaveBeenCalledTimes(1);
    ready = true;
    expect(await observed.decide({ ...turn, iteration: 2 })).toEqual({ kind: "complete", result: receipt });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
