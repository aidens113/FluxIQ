import { describe, expect, it } from "vitest";
import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import type { AutomationStudioRecordBatch } from "../../index.ts";
import { createExecutionAdmissionAuthority } from "../../../../runtime/execution-admission/index.ts";
import { ExecutionObservationSource } from "../../../../runtime/execution-observation/index.ts";
import { AdmissionTestSource } from "../../../../runtime/execution-admission/tests/source.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { AutomationPureCallbacks } from "../kernel/index.ts";
import { automationObservationFixture } from "./fixture.ts";

const compute: ExecutableGraph = { flowId: "controlled.compute", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] };
const capture: ExecutableGraph = {
  flowId: "controlled.capture",
  nodes: [{ id: "extract", definitionId: "builtin.policy.action", parameterValues: { outputId: "controlled.extract", recordOutput: {
    datasetId: "controlled.rows", recordsPath: "items", writeMode: "append",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
  } } }],
  edges: []
};

function summary(batch: AutomationStudioRecordBatch) {
  return { runId: "controlled.run", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "a".repeat(64), recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
}

function extracted() {
  return { status: "success" as const, route: "success", outputs: { result: { items: [{ name: "controlled row" }] } } };
}

function originalCallbacks(f: Awaited<ReturnType<typeof automationObservationFixture>>): ExecutionObservationSource {
  const original = f.engine.owner;
  if (!(original instanceof ExecutionObservationSource)) throw new Error("The engine fixture must retain its actual callback source owner.");
  return original;
}

async function refusesReopenedExecution(f: Awaited<ReturnType<typeof automationObservationFixture>>): Promise<void> {
  await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  const reopened = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
  const scope = await reopened.openScope(f.scopes.issue());
  expect((await reopened.consumer.inspect(scope)).state).toBe("pending");
  const root = new AdmissionTestSource(scope, "test.root");
  const ports = reopened.registerSource(root);
  const origin = root.origin();
  await expect(reopened.consumer.reserve(scope, ports.issuer.fromOrdinaryAdmission(root.admit(origin)))).rejects.toThrow();
}

describe("the actual observed record callback boundary", () => {
  it("completes a recordless graph without invoking or granting a contract to an unused effectful callback", async () => {
    const f = await automationObservationFixture();
    let writes = 0;
    const persist = (batch: AutomationStudioRecordBatch) => {
      writes++;
      return summary(batch);
    };
    f.options.onRecordBatch = persist;
    expect((await runAutomationStudioGraph(compute, f.options)).status).toBe("succeeded");
    expect(writes).toBe(0);
    expect(originalCallbacks(f).isManaged({ receiver: f.options, callback: persist })).toBe(false);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it("observes an actually invoked unsupported data callback without changing its receiver, tuple or first result", async () => {
    const f = await automationObservationFixture();
    let writes = 0;
    let received: AutomationStudioRecordBatch | undefined;
    const persist = function (this: AutomationStudioGraphExecutionOptions, batch: AutomationStudioRecordBatch) {
      writes++;
      received = batch;
      expect(this.onRecordBatch).toBe(persist);
      expect(arguments.length).toBe(1);
      expect(f.store.events.at(-1)).toBe("enter");
      return summary(batch);
    };
    f.options.onRecordBatch = persist;
    f.options.effectDispatcher = extracted;
    AutomationPureCallbacks.registerLexical(extracted);
    const trace = await runAutomationStudioGraph(capture, f.options);
    expect(trace.status).toBe("succeeded");
    expect(writes).toBe(1);
    expect(received).toMatchObject({ nodeId: "extract", rows: [{ name: "controlled row" }] });
    expect(trace.attempts[0]?.outputs.records).toEqual({ $dataset: { datasetId: "controlled.rows", recordCount: 1, schemaDigest: "a".repeat(64) } });
    expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "returned_unverified"))).toBe(true);
    await refusesReopenedExecution(f);
    expect(writes).toBe(1);
  });

  it.each(["own", "inherited"] as const)("refuses an %s accessor before reading it or copying options", async placement => {
    const f = await automationObservationFixture();
    let reads = 0;
    const owner = placement === "own" ? f.options : {};
    Object.defineProperty(owner, "onRecordBatch", { enumerable: true, get() {
      reads++;
      return summary;
    } });
    if (placement === "inherited") Object.setPrototypeOf(f.options, owner);
    await expect(runAutomationStudioGraph(compute, f.options)).rejects.toThrow("record_batch_accessor_unsupported");
    expect(reads).toBe(0);
    await refusesReopenedExecution(f);
    expect(reads).toBe(0);
  });

  it("does not transfer an original data callback's contract to its runtime replacement", async () => {
    const f = await automationObservationFixture();
    let originalCalls = 0;
    let writes = 0;
    const original = (batch: AutomationStudioRecordBatch) => {
      originalCalls++;
      return summary(batch);
    };
    const replacement = (batch: AutomationStudioRecordBatch) => {
      writes++;
      return summary(batch);
    };
    AutomationPureCallbacks.registerLexical(original);
    f.options.onRecordBatch = original;
    const replace = function (this: AutomationStudioGraphExecutionOptions) {
      this.onRecordBatch = replacement;
      return extracted();
    };
    AutomationPureCallbacks.registerLexical(replace);
    f.options.effectDispatcher = replace;
    expect((await runAutomationStudioGraph(capture, f.options)).status).toBe("succeeded");
    expect(originalCalls).toBe(0);
    expect(writes).toBe(1);
    expect(originalCallbacks(f).isManaged({ receiver: f.options, callback: replacement })).toBe(false);
    await refusesReopenedExecution(f);
    expect(writes).toBe(1);
  });

  it("refuses an accessor installed during the actual node before its getter or persistence runs", async () => {
    const f = await automationObservationFixture();
    let reads = 0;
    let writes = 0;
    const replace = function (this: AutomationStudioGraphExecutionOptions) {
      Object.defineProperty(this, "onRecordBatch", { enumerable: true, get() {
        reads++;
        return (batch: AutomationStudioRecordBatch) => {
          writes++;
          return summary(batch);
        };
      } });
      return extracted();
    };
    AutomationPureCallbacks.registerLexical(replace);
    f.options.effectDispatcher = replace;
    expect((await runAutomationStudioGraph(capture, f.options)).status).toBe("failed");
    expect(reads).toBe(0);
    expect(writes).toBe(0);
    await refusesReopenedExecution(f);
  });

  it("retains a failed durable accessor fence and refuses execution after reopening", async () => {
    const f = await automationObservationFixture();
    let reads = 0;
    const replace = function (this: AutomationStudioGraphExecutionOptions) {
      f.store.failNext("append");
      Object.defineProperty(this, "onRecordBatch", { enumerable: true, get() {
        reads++;
        return summary;
      } });
      return extracted();
    };
    AutomationPureCallbacks.registerLexical(replace);
    f.options.effectDispatcher = replace;
    const trace = await runAutomationStudioGraph(capture, f.options);
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.failure?.code).toBe("record_output.persist_failed");
    await expect(f.engine.flush()).rejects.toThrow("cleanup_failed");
    expect(reads).toBe(0);
    await refusesReopenedExecution(f);
  });

  it("preserves the unobserved legacy accessor and original callback tuple", async () => {
    let reads = 0;
    let writes = 0;
    const persist = function (this: AutomationStudioGraphExecutionOptions, batch: AutomationStudioRecordBatch) {
      writes++;
      expect(this.onRecordBatch).toBe(persist);
      expect(arguments.length).toBe(1);
      return summary(batch);
    };
    const options: AutomationStudioGraphExecutionOptions = { effectDispatcher: extracted };
    Object.defineProperty(options, "onRecordBatch", { enumerable: true, get() {
      reads++;
      return persist;
    } });
    expect((await runAutomationStudioGraph(capture, options)).status).toBe("succeeded");
    expect(reads).toBe(1);
    expect(writes).toBe(1);
  });
});
