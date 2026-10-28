// Test support for offline subflow trials: a brief's subflow proposal that
// reads rows through the domain read once per query, in order, and keeps the
// last read's rows priced above a threshold; its partial trial run live
// through the offline harness's traced gateway and scripted client; and the
// offline subflow trial of a proposal on that trial's recorded trace. The
// scoped judge is the harness's scripted verdict: no model is called.

import type { ClientGatewayClientHello, ClientGatewayTraceReevaluator, ClientGatewayTraceStore } from "../../../../../../client-gateway/index.ts";
import type { AutomationStudioFlowBootstrapEdge, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { runAutomationStudioDetachedSubflow } from "../../../flow-bootstrap/verification/index.ts";
import { runAutomationStudioSubflowTrial, type AutomationStudioSubflowTrialJudgeInput, type AutomationStudioSubflowTrialPorts } from "../../subflow-trial/index.ts";
import { runAutomationStudioOfflineSubflowTrial, type AutomationStudioOfflineTrialPhase } from "../index.ts";
import { READ, RECORD_OUTPUT, type OfflineHarness } from "./offline-harness.ts";

/** The brief the proposals are made for: one subflow with no predecessor, run by the router (no interface). */
export const SCOPE: AutomationStudioSubflowScope = Object.freeze({
  buildId: "build.offline", briefId: "brief.lamps", planDigest: "plan.offline", subflowKey: "lamps", predecessors: [],
  parts: [{ partId: "part.1", sourceId: "instruction", text: "keep the lamps priced above ten" }]
});

/** What the subflow is: one read per query, in order, then the last read's rows priced above `threshold`. */
export type SubflowShape = { queries: readonly string[]; threshold: number };

/** The brief's proposal at `revision`: start, a read per query, then the filter over the last read's rows. */
export function subflowOf(shape: SubflowShape, revision = 1): AutomationStudioSubflowProposal {
  const edge = (key: string, from: string, fromPort: string, to: string, toPort: string): AutomationStudioFlowBootstrapEdge => ({ key, source: { nodeKey: from, portId: fromPort }, target: { nodeKey: to, portId: toPort } });
  const reads = shape.queries.map((query, index): AutomationStudioFlowBootstrapNode => ({
    key: `read${index + 1}`, definitionId: "builtin.policy.action", definitionVersion: "1.0.0",
    parameters: { outputId: READ, parameters: { query }, recordOutput: { ...RECORD_OUTPUT, datasetId: `items${index + 1}` } }, consequences: []
  }));
  const last = reads.at(-1)!.key;
  const nodes: AutomationStudioFlowBootstrapNode[] = [
    { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
    ...reads,
    { key: "keep", definitionId: "builtin.data.filter-list", definitionVersion: "1.0.0", parameters: { path: "price", operator: "greater-than", value: shape.threshold } }
  ];
  const chain = ["start", ...reads.map((read) => read.key), "keep"];
  const edges = chain.slice(1).map((to, index) => edge(`next${index + 1}`, chain[index]!, "success", to, "in"));
  edges.push(edge("rows", last, "records", "keep", "items"));
  const subflow: AutomationStudioFlowBootstrapSubflow = { key: SCOPE.subflowKey, name: "Lamps", role: "utility", nodes, edges };
  const { buildId, briefId, planDigest, subflowKey } = SCOPE;
  return { scope: { buildId, briefId, planDigest, subflowKey }, revision, digest: `lamps.${revision}`, subflows: [subflow], summary: "Read and keep lamps", changedPaths: ["subflows"] };
}

export function subflowRequestFor(proposal: AutomationStudioSubflowProposal, signal = new AbortController().signal): AutomationStudioSubflowTrialRequest {
  return { scope: structuredClone(SCOPE) as AutomationStudioSubflowScope, proposal: structuredClone(proposal), signal };
}

export type SubflowHarness = ReturnType<typeof subflowHarness>;

/**
 * The partial trial ports over `harness`: its project, gateway and graph
 * options, no predecessor, the harness's scripted verdict as the scoped judge
 * (each input kept in `judged`), and the production partial runner, each run's
 * graph trace kept in `harness.executed`.
 */
export function subflowHarness(harness: OfflineHarness) {
  const { judge: _judge, execute: _execute, ...shared } = harness.ports;
  const judged: AutomationStudioSubflowTrialJudgeInput[] = [];
  const ports: AutomationStudioSubflowTrialPorts = {
    ...shared,
    predecessorProposals: async () => [],
    judge: async (input) => {
      judged.push(structuredClone(input));
      return structuredClone(harness.verdict.current);
    },
    execute: async (input) => {
      const result = await runAutomationStudioDetachedSubflow(input);
      if (result.trace) harness.executed.set(input.runId, result.trace);
      return result;
    }
  };
  /** Runs `proposal` as a live partial trial (no environment named), recorded into its own test episode; answers its outcome and its trace id. */
  const recordLive = async (proposal: AutomationStudioSubflowProposal) => {
    const before = harness.traces();
    const outcome = await runAutomationStudioSubflowTrial(subflowRequestFor(proposal), ports);
    if (harness.traces() !== before + 1) throw new Error(`the live partial trial opened ${harness.traces() - before} episodes`);
    return { outcome, traceId: `trace.offline-${harness.traces()}` };
  };
  return { ports, judged, recordLive };
}

export type OfflineSubflowRunOptions = { store?: ClientGatewayTraceStore; sessionView?: ClientGatewayClientHello; reevaluator?: ClientGatewayTraceReevaluator };

/** An offline subflow trial of `proposal` on the trace `traceId`, through the harnesses' own ports and gateway. */
export function runOfflineSubflow(harness: OfflineHarness, subflows: SubflowHarness, proposal: AutomationStudioSubflowProposal, traceId: string, phase: AutomationStudioOfflineTrialPhase = "test", options: OfflineSubflowRunOptions = {}) {
  return runAutomationStudioOfflineSubflowTrial({
    request: subflowRequestFor(proposal), ports: subflows.ports, source: { store: options.store ?? harness.store, traceId }, gateway: harness.gateway, phase,
    ...(options.sessionView === undefined ? {} : { sessionView: options.sessionView }),
    ...(options.reevaluator === undefined ? {} : { reevaluator: options.reevaluator })
  });
}
