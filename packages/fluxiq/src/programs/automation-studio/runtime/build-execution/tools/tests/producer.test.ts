import { expect, it } from "vitest";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/harness-options/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../../../llm/domain-instructions/index.ts";
import { bindAutomationStudioObservedBuildTools } from "../../bind-tools.ts";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import { BuildToolTestHost } from "./host.ts";
import { buildToolFixture } from "./fixture.ts";

function harness(host: AutomationStudioLlmEvidenceRuntimeBinding) {
  const binding = automationStudioLlmEvidenceRuntimeBindingChecked(host);
  return automationStudioHarnessOptionRegistry({ binding, nodeIds: ["example.action"] }).evidenceLoopBinding({ projectId: "project.isolated", flowId: "flow.actual" }, { scope: { kind: "domain", domainId: "example" }, allowSideEffectsWithoutPolicy: true });
}

it("enters the actual raw callback before a direct private write and preserves its original throw across reopen", async () => {
  const host = new BuildToolTestHost();
  const error = new Error("synthetic original raw write then lost acknowledgement");
  host.failure = error;
  const store = new AdmissionTestPersistence();
  const f = await buildToolFixture(store);
  host.beforeCall = () => {
    expect([...store.rows.values()].some(value => value.row.sourceKey === "studio.build.tools" && value.entered)).toBe(true);
    expect([...store.rows.values()].filter(value => value.row.sourceKey === "studio.build.callbacks" && !value.closed).length).toBeGreaterThanOrEqual(3);
  };
  const tools = harness(host);
  bindAutomationStudioObservedBuildTools(tools, f.observer);
  await expect(tools.executeTool({ callId: "call.one", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toBe(error);
  expect(host.calls).toBe(1);
  await expect(tools.executeTool({ callId: "call.two", toolId: "core.run_node", value: { node: "example.action", parameter: "new" } })).rejects.toThrow();
  const reopened = await buildToolFixture(store);
  const replacement = harness(host);
  bindAutomationStudioObservedBuildTools(replacement, reopened.observer);
  await expect(replacement.executeTool({ callId: "call.reopen", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  expect(host.calls).toBe(1);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});

it("keeps authentic original promise receipts across registry copies and distinct authored calls", async () => {
  const host = new BuildToolTestHost();
  const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.executeTool, contract: "managed_direct_effects", consumeCompletion: input => host.completion(input) }));
  const tools = harness(host);
  bindAutomationStudioObservedBuildTools(tools, f.observer);
  const first = await tools.executeTool({ callId: "call.first", toolId: "core.run_node", value: { node: "example.action", parameter: "one" }, referenceNow: 42 });
  const second = await tools.executeTool({ callId: "call.second", toolId: "core.run_node", value: { node: "example.action", parameter: "two" }, referenceNow: 42 });
  expect(first).toMatchObject({ evidence: { parameter: "one" } });
  expect(second).toMatchObject({ evidence: { parameter: "two" } });
  expect(host.calls).toBe(2);
  expect(host.requests.map(request => request.referenceNow)).toEqual([42, 42]);
  expect(host.requests.every(request => Object.getOwnPropertySymbols(request).length === 0)).toBe(true);
  expect(JSON.stringify(host.requests)).not.toMatch(/observer|reservation|proof|series/u);
  expect(f.issued).toHaveLength(2);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});

it("does not turn an unsupported forged unacted return into new execution authority", async () => {
  const host = new BuildToolTestHost();
  host.forged = true;
  const f = await buildToolFixture();
  const tools = harness(host);
  bindAutomationStudioObservedBuildTools(tools, f.observer);
  const result = await tools.executeTool({ callId: "call.forged", toolId: "core.run_node", value: { node: "example.action" } });
  expect(result).toMatchObject({ resultCode: "synthetic.unacted" });
  await expect(tools.executeTool({ callId: "call.changed", toolId: "core.run_node", value: { node: "example.action", parameter: "changed" } })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  const replacement = harness(host);
  bindAutomationStudioObservedBuildTools(replacement, reopened.observer);
  await expect(replacement.executeTool({ callId: "call.reopen", toolId: "core.run_node", value: { node: "example.action" } })).rejects.toThrow();
  expect(host.calls).toBe(1);
  expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
});
