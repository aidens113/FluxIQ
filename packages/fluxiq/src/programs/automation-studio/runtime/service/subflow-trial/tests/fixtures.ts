import { createBlankAutomationStudioFlowArtifact, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import type { AutomationStudioSubflowTrialJudgeInput, AutomationStudioSubflowTrialPorts } from "../index.ts";

// A partial trial as a builder's `core.test_subflow` asks it: a predecessor
// that adds an item, then the brief's own subflow that adds another.

export const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "custom.press", version: "1.0.0", label: "Press", description: "A press with a lasting consequence", category: "action",
  source: { kind: "code", moduleId: "test", implementationKey: "test.press", trust: "trusted-local" }, availability: { kind: "global" }, capabilities: { executable: true },
  safety: { requiredPermissions: [] }, inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: []
};
export const SPENT = Object.freeze({ inputTokens: 300, outputTokens: 30, totalTokens: 330, estimatedCostUsd: 0.002, calls: 2 });

export function part(key: string, role: AutomationStudioFlowBootstrapSubflow["role"]): AutomationStudioFlowBootstrapSubflow {
  return {
    key, name: key, role, interface: { inputs: [], outputs: [] },
    nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "press", definitionId: PRESS.id, definitionVersion: PRESS.version, consequences: ["create_new"] }],
    edges: [{ key: "next", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "press", portId: "in" } }]
  };
}

export function subflowTrialFixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, PRESS]);
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const scope: AutomationStudioSubflowScope = {
    buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add", predecessors: ["find"],
    parts: [{ partId: "part.2", sourceId: "instruction", text: "add it to the list" }], interface: { inputs: [], outputs: [] }
  };
  const findProposal: AutomationStudioSubflowProposal = { scope: { buildId: "build.1", briefId: "brief.find", planDigest: "plan.1", subflowKey: "find" }, revision: 1, digest: "find.1", subflows: [part("find", "primary")], summary: "find", changedPaths: [] };
  const proposal: AutomationStudioSubflowProposal = { scope: { buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", subflowKey: "add" }, revision: 3, digest: "add.3", subflows: [part("add", "utility")], summary: "add", changedPaths: [] };
  const request = (signal = new AbortController().signal): AutomationStudioSubflowTrialRequest => ({ scope: structuredClone(scope), proposal: structuredClone(proposal), signal });
  const sessions: AutomationStudioRuntimeSession[] = [];
  const judged: AutomationStudioSubflowTrialJudgeInput[] = [];
  const pressed: string[] = [];
  let failing: string | undefined;
  let predecessors: AutomationStudioSubflowProposal[] = [findProposal];
  let verdict: AutomationStudioBuildTestVerdict = { verdict: "yes", spent: { ...SPENT } };
  let runs = 0;
  const ports: AutomationStudioSubflowTrialPorts = {
    projectId: "project", flowId: "parent", sourceInstructionIds: ["instruction"], registry, resolution,
    parentFlow: async () => structuredClone(parentFlow), currentBaseDigest: async () => "base", snapshots: async () => [], deprecatedPublicationIds: async () => [],
    openSession: async ({ runId, metadata }) => {
      const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId, projectId: "project", targetKind: "flow", targetId: "parent", flowId: "parent", status: "queued", queuedAt: 1, flow: { flowId: "parent" } as AutomationStudioRuntimeSession["flow"], metadata };
      sessions.push(structuredClone(session));
      return session;
    },
    writeSession: async (session) => { sessions.push(structuredClone(session)); },
    graphOptions: ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async ({ node }) => {
      pressed.push(node.id);
      if (failing && node.id.includes(`.${failing}.`)) return { result: { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "press.target_missing", retryable: false, stage: "execution" } } };
      return { result: { status: "success", route: "success", outputs: {} } };
    } }),
    processDatasets: async () => undefined, recordSets: async () => [], deniedEvidenceKeys: [],
    predecessorProposals: async () => structuredClone(predecessors),
    judge: async (input) => {
      judged.push(structuredClone(input));
      return structuredClone(verdict);
    },
    now: () => 100, newRunId: () => `subflow-trial.${++runs}`
  };
  return {
    ports, request, sessions, judged, pressed, findProposal,
    failIn: (key: string) => { failing = key; },
    setPredecessors: (next: AutomationStudioSubflowProposal[]) => { predecessors = next; },
    setVerdict: (next: AutomationStudioBuildTestVerdict) => { verdict = next; }
  };
}
