// t775 D2: one explored-toggle record per project build, shared by every brief
// of it (`../brief-ports.ts`). A press explored in one brief and answered as a
// toggle is what a step submitted in another brief of the same build is tied
// to; another project build starts with none.
//
// The phase start and the harness options are replaced as in
// `project-build-reset-settle.test.ts`: what is under test is the wiring.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import type { AutomationStudioProjectBriefPortRequest } from "../../../project-agents/index.ts";
import { automationStudioProjectBuildBriefPorts } from "../brief-ports.ts";

const RUN_NODE: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } } as unknown as AutomationStudioLlmEvidenceTool;
const PRESS = { node: "domain.demo.press", parameters: { target: { handle: "t1" } }, consequences: [] };

vi.mock("../../../llm/index.ts", async (original) => ({
  ...(await original<object>()),
  automationStudioLlmNodeDescriptions: () => ({ ids: () => [], definition: () => undefined }),
  automationStudioHarnessOptionRegistry: () => ({
    evidenceLoopBinding: () => ({
      tools: [{ toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } }],
      observedStateKeys: [],
      executeTool: async () => ({
        kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true,
        outputs: { toggle: { signature: { state: "s.on" } } },
        draft: { actionId: "domain.demo.press", ranWith: { node: "domain.demo.press", parameters: { target: { selector: "#setting" } } } }
      })
    })
  })
}));
vi.mock("../phase-start.ts", async () => {
  class PhaseStart {
    reset() { return { beforeTrial: async () => ({}), trialRan: () => [] }; }
    async explore() { return { record: {}, entry: { kind: "start" }, told: undefined }; }
  }
  return { AutomationStudioProjectBuildPhaseStart: PhaseStart };
});

function factory() {
  const project = new AutomationStudioSiteResetProjectLedger();
  const binding = { domainId: "example", deniedEvidenceKeys: [], tools: [RUN_NODE], executeTool: async () => ({}), startState: async () => ({ state: {}, differs: [] }) };
  const ports = automationStudioProjectBuildBriefPorts({
    project: { ledger: project, binding, hostRuntime: undefined, flowInputs: [], cancellation: { tool: (execute: unknown) => execute }, permissions: { permittedConsequences: [], instructionIds: [] }, personAsk: undefined, trialEnvironment: {}, runHarness: async () => ({}) },
    draft: { submission: { projectId: "project", flowId: "flow", resolution: {}, instructionText: "", originalSource: "", signal: new AbortController().signal }, loop: {}, maxConsecutiveUnusableDecisions: 3 },
    decisions: { decide: () => async () => ({ kind: "complete", result: {} }) },
    subflowTrial: {}, proposals: {}, accounting: () => ({}), acts: { calls: (calls: unknown) => calls, trialRan: () => undefined }
  } as unknown as Parameters<typeof automationStudioProjectBuildBriefPorts>[0]);
  const request = (briefId: string) => ({
    brief: { briefId, kind: "build", subflowKey: "keep", parts: [], permittedActs: [], maxIterations: 4 },
    scope: { buildId: "build.1", briefId, planDigest: "plan.1", subflowKey: "keep", predecessors: [], parts: [], interface: { inputs: [], outputs: [] } },
    ledger: project.forBrief(briefId), lease: {}, signal: new AbortController().signal
  }) as unknown as AutomationStudioProjectBriefPortRequest;
  return { ports, request };
}

describe("the explored toggles of a project build", () => {
  it("are one record for every brief: a press explored in brief 1 is read by brief 2's submission", async () => {
    const { ports, request } = factory();
    const one = await ports.builder(request("brief.1"));
    const two = await ports.builder(request("brief.2"));
    await one.loop.executeTool({ callId: "c1", toolId: "core.run_node", value: PRESS as unknown as JsonObject });
    expect(one.submission.exploredToggles?.list()).toMatchObject([{ callId: "c1", node: "domain.demo.press", signature: { state: "s.on" } }]);
    expect(two.submission.exploredToggles?.list()).toMatchObject([{ callId: "c1", node: "domain.demo.press" }]);
  });

  it("are not shared between two project builds", async () => {
    const a = factory();
    const b = factory();
    const one = await a.ports.builder(a.request("brief.1"));
    const other = await b.ports.builder(b.request("brief.1"));
    await one.loop.executeTool({ callId: "c1", toolId: "core.run_node", value: PRESS as unknown as JsonObject });
    expect(one.submission.exploredToggles?.list()).toHaveLength(1);
    expect(other.submission.exploredToggles?.list()).toEqual([]);
  });
});
