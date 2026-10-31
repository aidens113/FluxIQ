import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot, type AutomationStudioFlowDocument, type AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioImporterSdkManifest, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime, runAutomationStudioGraph, runCanonicalAutomationStudioFlow } from "../../index.ts";
import { automationStudioRunGraphOptions } from "../../service/runtime-session/index.ts";
import { automationStudioRootInvocation } from "../../executor/frames/index.ts";
import type { AutomationStudioExecutorCommandRun } from "../../executor/command-scope/index.ts";

function definition(id: string): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label: "Apply",
    description: "Apply a pending change.",
    category: "custom",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: id },
    availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true },
    actionEffect: { effectClass: id === "example.commit" ? "commit" : "observe" },
    inputs: [],
    outputs: [],
    parameters: []
  };
}

async function nested(kind: "flow" | "subflow", proof: "unknown" | "landed" | "not_landed" | "unacted") {
  let calls = 0;
  let alternatives = 0;
  let parentChecks = 0;
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [definition("example.commit"), definition("example.alternative")]
  };
  const native = new AutomationStudioNativeNodeRuntime().register(manifest, {
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    implementations: {
      "example.commit": (): AutomationNodeExecutionResult => {
        calls += 1;
        if (proof === "unacted" && calls === 1) return { status: "failed", outputs: {}, failure: { category: "action_failed", code: "example.busy", retryable: true, stage: "execution", effect: "unacted" } };
        if ((proof === "unacted" || proof === "not_landed") && calls > 1) return { outputs: {} };
        throw new Error("Lost acknowledgement.");
      },
      "example.alternative": (): AutomationNodeExecutionResult => {
        alternatives += 1;
        return { status: "failed", outputs: {}, message: "Alternative failed." };
      }
    }
  });
  const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: native });
  options.allowLlmDiagnosis = false;
  options.delay = async () => undefined;
  options.hostRuntime = {
    capabilities: [],
    actLanded: ({ node }) => {
      if (node.definitionId === "example.commit") return proof === "unacted" ? "unknown" : proof;
      parentChecks += 1;
      return "not_landed";
    }
  };
  const child = {
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child.effect", projectId: "project", name: "Child", now: 1 }),
    nodes: [{ id: "commit", definitionId: "example.commit" }]
  };
  const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
  const call: AutomationStudioFlowNode = kind === "flow"
    ? createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } })
    : { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } };
  call.metadata = { ...call.metadata, effect: "observe", idempotent: true, declaredConsequences: [], optional: true, onFailure: "continue" };
  call.parameterValues = { ...call.parameterValues, retry: { maxAttempts: 3 } };
  const parent = {
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent.effect", projectId: "project", name: "Parent", now: 1 }),
    nodes: [call, { id: "alternative", definitionId: "example.alternative" }, { id: "end", definitionId: "builtin.control.end" }],
    edges: [
      { id: "failed-alternative", sourceNodeId: "call", sourcePortId: "failed", targetNodeId: "alternative", targetPortId: "in" },
      { id: "success-end", sourceNodeId: "call", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  };
  const childGraph: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: child.flowId, ownerKind: "routine", ownerId: child.flowId, name: child.name, nodes: child.nodes, edges: [], createdAt: 1, updatedAt: 1 };
  const parentGraph: AutomationStudioFlowDocument = { ...childGraph, flowId: parent.flowId, nodes: parent.nodes, edges: parent.edges };
  const trace = kind === "flow"
    ? await runCanonicalAutomationStudioFlow(parent, [snapshot], options)
    : await runAutomationStudioGraph(parentGraph, { ...options, subflowGraphs: { load: async () => ({ subflowId: "child", graph: childGraph, graphRevision: null }) } });
  return { trace, calls, alternatives, parentChecks };
}

describe("uncertain committing children", () => {
  it("stops actual Call Flow and Subflow containers before whole-child retries or hostile failed alternatives", async () => {
    for (const kind of ["flow", "subflow"] as const) {
      const result = await nested(kind, "unknown");
      expect.soft(result.calls, kind).toBe(1);
      expect.soft(result.alternatives, kind).toBe(0);
      expect.soft(result.parentChecks, kind).toBe(0);
      expect.soft(result.trace.failure?.code, kind).toBe("run.outcome_uncertain");
      expect.soft(result.trace.attempts.map((attempt) => attempt.nodeId), kind).toEqual(["call"]);
    }
  });

  it("preserves the child's positive landed/not-landed and explicit unacted settlement", async () => {
    for (const kind of ["flow", "subflow"] as const) {
      for (const proof of ["landed", "not_landed", "unacted"] as const) {
        const result = await nested(kind, proof);
        expect(result.calls).toBe(proof === "landed" ? 1 : 2);
        expect(result.alternatives).toBe(0);
        expect(result.trace.status).toBe("succeeded");
      }
    }
  });

  it("returns an authoritative required-mode child stop through a latched checkpoint, without hiding other refusals", async () => {
    for (const uncertain of [true, false]) {
      let latched = false;
      let postLatchChecks = 0;
      const controller = new AbortController();
      const commandRun: AutomationStudioExecutorCommandRun = {
        signal: controller.signal,
        acceptsComposite: () => true,
        own: (start) => start(),
        checkpoint: async () => {
          if (latched) {
            postLatchChecks += 1;
            throw new Error("Checkpoint refused.");
          }
        },
        context: async () => { throw new Error("No external command is dispatched in this latch-contract test."); },
        consume: async () => undefined,
        stop: async () => undefined,
        receipted: () => false,
        withdraw: () => false
      };
      const parent = {
        ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.required.parent", projectId: "project", name: "Parent", now: 1 }),
        nodes: [{ id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" }, metadata: { effect: "observe", idempotent: true } }]
      };
      const child: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.required.child", ownerKind: "routine", ownerId: "flow.required.child", name: "Child", nodes: [], edges: [], createdAt: 1, updatedAt: 1 };
      const invocation = automationStudioRootInvocation(parent, {}, async () => {
        latched = true;
        return { status: "failed", startedAt: 1, attempts: [], values: {}, effects: [], failure: { category: "ambiguous_or_unknown", code: uncertain ? "run.outcome_uncertain" : "example.other_refusal", retryable: false, stage: "confirmation", effect: "ambiguous" } };
      });
      const running = runCanonicalAutomationStudioFlow(parent, [], { commandRun, invocation, subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: null }) } });
      if (uncertain) {
        const trace = await running;
        expect(trace.failure?.code).toBe("run.outcome_uncertain");
        expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["call"]);
        expect(postLatchChecks).toBe(0);
      } else {
        await expect(running).rejects.toThrow("Checkpoint refused.");
        expect(postLatchChecks).toBeGreaterThan(0);
      }
    }
  });
});
