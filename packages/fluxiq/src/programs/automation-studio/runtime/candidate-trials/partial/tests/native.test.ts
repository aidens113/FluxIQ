import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlow, createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { bindAutomationExecutionObservation } from "../../../../../../engine/automation/execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../../../engine/automation/contracts/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { bindTrialExecutionSource } from "../../observation/index.ts";
import { automationStudioSubflowTrialPort, type AutomationStudioSubflowTrialPorts } from "../../../service/subflow-trial/index.ts";
import { partialAdmissionFixture } from "./fixture.ts";

describe("partial execution forwards the real engine observation", () => {
  it.each(["trial", "from_step", "direct_trial", "direct_from_step"] as const)("holds a real native counter after a lost acknowledgement on %s, including a previously bound options copy", async entrance => {
    let counter = 0;
    let ids = 0;
    let starts = 0;
    const persistence = new AdmissionTestPersistence();
    const f = await partialAdmissionFixture({ persistence, engine: true, port: async () => { throw new Error("unused fixture port"); } });
    const automation = f.automation;
    if (!automation) throw new Error("The actual engine source is required.");
    const oldRoot = new AdmissionTestSource(f.executionScope, "previous.actual.root");
    oldRoot.delegatesTo.push(automation.owner);
    const oldPorts = f.assembly.registerSource(oldRoot);
    const origin = oldRoot.origin();
    const previous = await f.assembly.consumer.reserve(f.executionScope, oldPorts.issuer.fromOrdinaryAdmission(oldRoot.admit(origin)));
    const options: AutomationStudioGraphExecutionOptions = {
      retryPolicy: { maxAttempts: 4, backoffMs: [] },
      nativeNodeExecutor: async () => {
        counter += 1;
        throw new Error("synthetic private native acknowledgement lost");
      }
    };
    bindAutomationExecutionObservation(options, automation.forParent({ reservation: previous.reservation, parent: previous.root }));
    await oldPorts.producer.finish(previous.root, oldRoot.complete(origin));
    await f.assembly.consumer.release(previous.reservation);
    const parentFlow = createBlankAutomationStudioFlowArtifact({ projectId: "project.isolated", flowId: "flow.actual", scope: f.resolution.scope, name: "Isolated parent", now: 1 });
    const sessionFlow = createBlankAutomationStudioFlow({ flowId: parentFlow.flowId, ownerKind: "task", ownerId: "task.isolated", name: parentFlow.name, now: 1 });
    const ports: AutomationStudioSubflowTrialPorts = {
      projectId: "project.isolated", flowId: "flow.actual", sourceInstructionIds: ["instruction.isolated"], registry: f.registry, resolution: f.resolution,
      parentFlow: async () => structuredClone(parentFlow), currentBaseDigest: async () => "base", snapshots: async () => [], deprecatedPublicationIds: async () => [],
      openSession: async ({ runId, metadata }) => ({ schemaVersion: "0.1", projectId: "project.isolated", flowId: "flow.actual", targetKind: "flow", targetId: "flow.actual", flow: sessionFlow, runId, queuedAt: 1, status: "queued", metadata }),
      writeSession: async () => undefined, graphOptions: ({ signal }) => ({ ...options, signal }),
      processDatasets: async () => undefined, recordSets: async () => [], predecessorProposals: async () => [],
      judge: async () => { throw new Error("an uncertain native effect cannot be judged"); },
      prepareStart: async () => {
        starts += 1;
        return { reset: true };
      },
      newRunId: () => `partial.actual.${++ids}`
    };
    // The original binding must be on the actual object returned to the canonical copy seam.
    ports.graphOptions = ({ signal }) => {
      const actual = { ...options, signal };
      bindAutomationExecutionObservation(actual, automation.forParent({ reservation: previous.reservation, parent: previous.root }));
      return actual;
    };
    bindTrialExecutionSource(ports, f.configured);
    const trials = automationStudioSubflowTrialPort(f.scope.buildId, ports);
    const gate = f.newGate(trials.port);
    const fromStep = entrance.endsWith("from_step");
    const value = () => ({ ...f.receipt(), ...(fromStep ? { from: "read" } : {}) });
    const request = () => {
      const proposal = f.controller.latest();
      if (!proposal) throw new Error("The validated proposal is required.");
      return { scope: f.scope, proposal, signal: new AbortController().signal };
    };
    await expect(trials.port.prepareStart!({ scope: f.scope, ...f.receipt(), signal: new AbortController().signal })).rejects.toThrow("subflow.trial_admission_required");
    expect(starts).toBe(0);
    const first = entrance === "direct_trial" ? await trials.port(request())
      : entrance === "direct_from_step" ? await trials.port.fromStep!({ ...request(), fromKey: "read" })
      : await gate.test(value());
    expect(counter, JSON.stringify(first)).toBe(1);
    expect(JSON.stringify(first)).not.toContain("synthetic private native");
    const facts = [...persistence.rows.values()].map(value => ({ source: value.row.sourceKey, closed: value.closed, facts: value.facts.map(fact => fact.kind) }));
    expect((await f.assembly.consumer.inspect(f.executionScope)).state, JSON.stringify(facts)).toBe("pending");
    expect([...persistence.rows.values()].some(value => value.row.sourceKey === "automation.engine" && value.facts.some(fact => fact.kind === "terminal_unknown" || fact.kind === "interrupted"))).toBe(true);
    await expect(f.newGate(trials.port).test(value())).rejects.toThrow();
    await f.submit("a genuine revised native input");
    await expect(f.newGate(trials.port).test(value())).rejects.toThrow();
    expect(counter).toBe(1);
    expect(starts).toBe(fromStep ? 0 : 1);
  });
});
