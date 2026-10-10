// A part a Flow script calls, assembled and saved as the authoring pipeline
// writes it (t388), then run on the executor's Call Subflow (t392). The two
// were written apart: authoring writes each `inputs` entry as the value or
// binding it gives, minted Subflow ids, and a part output as an interface port
// whose `metadata.binding` names a step of the part by its key. This holds the
// executor to reading exactly that: the child gets its inputs, nothing else of
// the parent's, and the caller reads the part's outputs off the call step.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../../flow-bootstrap/authoring/index.ts";
import { savedFlowValidation, stateNodeRegistryFixture, webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import type { AutomationStudioSubflowGraphSource } from "../../../executor/frames/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = stateNodeRegistryFixture(webDomainNodeDefinitionsFixture());

const script = [
  "flow: Renew a library loan",
  "step: open the account",
  "  node: web.browser.navigate",
  "  url: https://library.test/account",
  "step renew: renew the loan",
  "  call: renewal",
  "  card: $input.card = 4417",
  "step: say what is due",
  "  node: web.dom.type",
  "  selector: #t9",
  "  text: $step.renew.loans",
  "part renewal: renew one loan",
  "  input: card",
  "  output: loans = $step.loans.records",
  "  step: type the card number",
  "    node: web.dom.type",
  "    selector: #t1",
  "    text: $input.card",
  "  step loans: read the loans",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "    extractList.minItems: 0",
  "end"
];

const LOANS: JsonValue = [{ title: "Dune", due: "2026-10-20" }];

/** The saved topology the script is applied as. */
function savedTopology() {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: script.join("\n") }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  const saved = savedFlowValidation(accepted.plan, registry, resolution);
  expect(saved.errors).toEqual([]);
  return saved.topology!;
}

/** A saved graph Flow as the run session hands it to the executor (`../../../service/runtime-session/subflow-frame.ts`). */
function graphOf(artifact: AutomationStudioFlowArtifact): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name, nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt, ...(artifact.metadata ? { metadata: artifact.metadata } : {}) };
}

/** The Subflows a run of the saved topology may call, read as the run session reads them. */
function subflowSource(topology: ReturnType<typeof savedTopology>, loads: string[] = []): AutomationStudioSubflowGraphSource {
  return {
    load: async (subflowId) => {
      loads.push(subflowId);
      const entry = topology.subflows.find((candidate) => candidate.subflow.subflowId === subflowId);
      return entry ? { subflowId, graph: graphOf(entry.graphFlow), graphRevision: null, artifact: entry.graphFlow } : undefined;
    }
  };
}

/** A host that runs the web steps: it types, reads one loan, and keeps every request it was handed. */
function fakeHost() {
  const requests: Array<{ node: AutomationStudioFlowNode; inputs: Record<string, JsonValue> }> = [];
  return {
    requests,
    nativeNodeExecutor: async (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue> }) => {
      requests.push({ node: request.node, inputs: request.inputs });
      const records = request.node.definitionId.includes("extract") ? { records: LOANS } : {};
      return { result: { status: "success" as const, route: "success", outputs: records } };
    }
  };
}

describe("a part a Flow script calls, run on Call Subflow", () => {
  it("hands the part its input, and the caller the part's output", async () => {
    const topology = savedTopology();
    const [main, part] = topology.subflows;
    const call = main!.graphFlow.nodes.find((node) => node.definitionId === "builtin.control.call-subflow")!;
    // What authoring saved: the minted Subflow id, a binding for the input, the output by its own name.
    expect(call.parameterValues).toMatchObject({ subflowId: part!.subflow.subflowId, inputs: { card: { $state: { path: "card", fallback: 4417 } } }, outputs: { loans: "loans" } });

    const loads: string[] = [];
    const subflowGraphs = subflowSource(topology, loads);
    const host = fakeHost();
    let executed: AutomationStudioGraphExecutionTrace | undefined;
    const saved = await runAutomationStudioGraph(graphOf(main!.graphFlow), {
      inputs: { card: "5555", secret: "parent-only" },
      currentSubflowId: main!.subflow.subflowId,
      subflowGraphs,
      nativeNodeExecutor: host.nativeNodeExecutor
    }, (trace) => { executed = trace; });

    expect(saved.status).toBe("succeeded");
    expect(loads).toEqual([part!.subflow.subflowId]);
    // The part's first step typed the card the caller gave it, not the test value.
    const typed = host.requests.filter((request) => request.node.definitionId.includes("type"));
    expect(typed.map((request) => request.node.parameterValues?.text)).toEqual(["5555", LOANS]);
    // Nothing of the parent's but its input crossed into the part.
    const inPart = host.requests.filter((request) => part!.graphFlow.nodes.some((node) => node.id === request.node.id));
    expect(inPart).toHaveLength(2);
    for (const request of inPart) expect(request.inputs.secret).toBeUndefined();
    // The call step handed back the part's declared output, which the caller's next step read.
    const attempt = (executed ?? saved).attempts.find((candidate) => candidate.nodeId === call.id)!;
    expect(attempt.outputs.loans).toEqual(LOANS);
    expect(attempt.subflowTarget).toMatchObject({ subflowId: part!.subflow.subflowId, graphFlowId: part!.graphFlow.flowId });
    expect(attempt.childTrace?.status).toBe("succeeded");
  });

  it("uses the input's test value when the caller is run without one", async () => {
    const topology = savedTopology();
    const [main] = topology.subflows;
    const host = fakeHost();
    const saved = await runAutomationStudioGraph(graphOf(main!.graphFlow), {
      currentSubflowId: main!.subflow.subflowId,
      subflowGraphs: subflowSource(topology),
      nativeNodeExecutor: host.nativeNodeExecutor
    });
    expect(saved.status).toBe("succeeded");
    expect(host.requests.find((request) => request.node.definitionId.includes("type"))?.node.parameterValues?.text).toBe(4417);
  });
});
