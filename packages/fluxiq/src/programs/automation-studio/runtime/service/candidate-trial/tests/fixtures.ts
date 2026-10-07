import { createBlankAutomationStudioFlowArtifact, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import type { AutomationStudioCandidateTrialPorts } from "../contracts.ts";

/** A trusted native press that declares a lasting consequence, as a domain's add-to-cart would. */
export const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "custom.press", version: "1.0.0", label: "Press", description: "A press with a lasting consequence", category: "action",
  source: { kind: "code", moduleId: "test", implementationKey: "test.press", trust: "trusted-local" }, availability: { kind: "global" }, capabilities: { executable: true },
  safety: { requiredPermissions: [] }, inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: []
};

export const SPENT_NOTHING = Object.freeze({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, calls: 0 });
export const SPENT_TWO = Object.freeze({ inputTokens: 400, outputTokens: 40, totalTokens: 440, estimatedCostUsd: 0.001, calls: 2 });

/** Start, then one press declaring `consequences`, as a validated candidate of revision 1. */
export function trialFixture(consequences: string[] = ["move_money"]) {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, PRESS]);
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
      { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
      { key: "press", definitionId: PRESS.id, definitionVersion: PRESS.version, consequences }
    ], edges: [{ key: "next", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "press", portId: "in" } }] }]
  };
  const buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution, registry }).validated;
  if (!buildPlan) throw new Error("fixture plan did not validate");
  const candidate: AutomationStudioFlowCandidate = { revision: 1, digest: "a".repeat(64), baseDependencyDigest: "base", status: "draft", summary: "Press it", buildPlan, changedPaths: ["plan"] };
  const request = (signal = new AbortController().signal): AutomationStudioCandidateTrialRequest => ({ candidateId: "candidate.1", revision: 1, digest: candidate.digest, signal, candidate: structuredClone(candidate) });
  const sessions: AutomationStudioRuntimeSession[] = [];
  const judged: Parameters<AutomationStudioCandidateTrialPorts["judge"]>[0][] = [];
  let verdict: AutomationStudioBuildTestVerdict = { verdict: "yes", spent: { ...SPENT_TWO } };
  let runs = 0;
  const ports: AutomationStudioCandidateTrialPorts = {
    projectId: "project", flowId: "parent", sourceInstructionIds: ["instruction"], registry, resolution,
    parentFlow: async () => structuredClone(parentFlow), currentBaseDigest: async () => "base", snapshots: async () => [], deprecatedPublicationIds: async () => [],
    openSession: async ({ runId, metadata }) => { const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId, projectId: "project", targetKind: "flow", targetId: "parent", flowId: "parent", status: "queued", queuedAt: 1, flow: { flowId: "parent" } as AutomationStudioRuntimeSession["flow"], metadata }; sessions.push(structuredClone(session)); return session; },
    writeSession: async (session) => { sessions.push(structuredClone(session)); },
    graphOptions: ({ signal }) => ({ signal, now: () => 100 }),
    processDatasets: async () => undefined, recordSets: async () => [],
    judge: async (input) => { judged.push(structuredClone(input)); return structuredClone(verdict); },
    now: () => 100, newRunId: () => `trial.${++runs}`
  };
  return { parentFlow, registry, resolution, buildPlan, candidate, request, ports, sessions, judged, setVerdict: (next: AutomationStudioBuildTestVerdict) => { verdict = next; } };
}
