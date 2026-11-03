// What a Flow's creation leaves behind when it ends (t438). Outside the Lab
// its spend record goes with it. In a Lab-scoped run the record is the Flow's
// whole purse -- the user's words (2026-10-01): "bring the ceiling down to $0.1
// per flow max" -- so the build runs under it, the chat's reading is counted
// in it, and it outlives the creation for the Flow's runs to draw on.
import { describe, expect, it } from "vitest";
import { automationStudioLlmBuildPurseHoldCall, automationStudioLlmCurrentFlowPurse } from "../../../llm/build-purse/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../index.ts";
import { automationStudioFlowBootstrapCreationPurse } from "../creation-purse.ts";
import { runAutomationStudioLlmHarness } from "../../../llm/index.ts";
import { prepareInstructionModelRun, invokePreparedInstructionModelRun } from "../../../../../../runtime/flow-authoring/instruction-observation/index.ts";
import { ExecutionCallbackPolicies, OriginalExecutionPromiseReceipts } from "../../../../../../runtime/execution-observation/index.ts";
import { observationFixture } from "../../../../../../runtime/execution-observation/tests/fixture.ts";
import type { ModelExecutionOptions } from "../../../../../../runtime/models/execution/index.ts";

const PROJECT = "project.one";
const FLOW = "flow.one";

async function store(spentUsd: number): Promise<AutomationStudioFlowBootstrapCreationSpendStore> {
  const projectPaths = new AutomationStudioProjectPaths(undefined);
  const held = new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), {} as unknown as AutomationStudioProjectStore);
  await held.save({ kind: "flow_creation_spend", projectId: PROJECT, flowId: FLOW, spentUsd, builds: 1, createdAt: 1, updatedAt: 1 });
  return held;
}

/** One call through the harness's hold, charged `costUsd`. */
function call(costUsd: number): void {
  const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => costUsd }, estimatedInputTokens: 1000, maxOutputTokens: 100 });
  if (held?.ok) held.hold.settle({ estimatedCostUsd: costUsd });
}

describe("a Flow creation that ended", () => {
  it("takes its spend record with it outside the Lab", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: false, flowPurse: false, interpretationCostUsd: 0.001, ceilingUsd: 1 });
    await creation.run(async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeUndefined();
      creation.ended();
    });
    expect(await held.get(PROJECT, FLOW)).toBeUndefined();
  });

  it("in a Lab-scoped run counts the chat's reading, runs under the Flow's purse, and keeps the record with every call in it", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: false, flowPurse: true, interpretationCostUsd: 0.001, ceilingUsd: 0.1 });
    expect(creation.purse.carriedUsd).toBe(0.031);
    await creation.run(async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeDefined();
      call(0.02);
      creation.ended();
    });
    expect(await held.get(PROJECT, FLOW)).toMatchObject({ spentUsd: 0.051, builds: 2, createdAt: 1 });
    expect(creation.purse.spentUsd()).toBeCloseTo(0.051, 9);
  });

  it("never reads or writes the record for a repair's build outside the Lab", async () => {
    const held = await store(0.03);
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: held, projectId: PROJECT, flowId: FLOW, repair: true, flowPurse: false, ceilingUsd: 1 });
    await creation.run(async () => {
      call(0.02);
    });
    expect(creation.purse.spentUsd()).toBe(0.02);
    expect(await held.get(PROJECT, FLOW)).toMatchObject({ spentUsd: 0.03, builds: 1 });
  });
});

describe("the original observed creation reading", () => {
  it("awaits its retained result owner's actual ACK and preserves both original Promise and request identities", async () => {
    const f = await observationFixture();
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: await store(0), projectId: PROJECT, flowId: FLOW, repair: true, flowPurse: false, ceilingUsd: 1 });
    const request = { taskKind: "evidence_tool_decision" as const, projectId: PROJECT, flowId: FLOW, instructions: [], dryRun: true };
    const retained = await runAutomationStudioLlmHarness(request);
    expect(retained.providerInvocation).toBe("not_attempted");
    const receipts = new OriginalExecutionPromiseReceipts();
    let release!: () => void;
    let started!: () => void;
    let calls = 0;
    const held = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const run = (given: typeof request, execution?: ModelExecutionOptions) => {
      expect(given).toBe(request);
      expect(Object.isFrozen(execution)).toBe(true);
      const observation = execution?.observation;
      if (!observation) throw new Error("The original retained-result read needs its entered observation.");
      calls++;
      started();
      const returned = held.then(() => {
        receipts.issueObserved(returned, observation, { disposition: "settled", completionDigest: "controlled.cached_read.ack", assessmentDigest: "controlled.cached_read.no_provider_or_queued_io" });
        return retained;
      });
      return returned;
    };
    ExecutionCallbackPolicies.rememberManaged({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
    const reading = creation.reading(run, f.source);
    const prepared = await prepareInstructionModelRun(f.observation, { original: "authority-input" }, reading, request, f.source);
    const running = invokePreparedInstructionModelRun(prepared);
    try {
      await entered;
      expect(calls).toBe(1);
      expect(prepared.completion()).toBe("pending");
      release();
      expect(await running).toBe(retained);
      expect(prepared.completion()).toBe("settled");
      expect(creation.readingRefused).toBeUndefined();
      expect(creation.purse.chargedReceipt().calls).toBe(0);
      await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
      await f.authority.consumer.release(f.reserved.reservation);
      expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
    } finally {
      release();
      await Promise.allSettled([running]);
    }
  });

  it("refuses missing, copied and foreign configured options before producer admission or runner work", async () => {
    const f = await observationFixture();
    const foreign = await observationFixture();
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: await store(0), projectId: PROJECT, flowId: FLOW, repair: true, flowPurse: false, ceilingUsd: 1 });
    let calls = 0;
    const run = async (_request: object) => {
      calls++;
      throw new Error("An invalid configured reading must never reach its runner.");
    };
    const reading = creation.reading(run, f.source);
    const before = f.store.events.length;
    const foreignBefore = foreign.store.events.length;
    await expect(reading({})).rejects.toThrow("instruction_observation.current_scope_required");
    await expect(reading({}, { observation: structuredClone(f.observation) })).rejects.toThrow("instruction_observation.foreign_source");
    await expect(reading({}, { observation: foreign.observation })).rejects.toThrow("instruction_observation.foreign_source");
    expect(calls).toBe(0);
    expect(f.store.events).toHaveLength(before);
    expect(foreign.store.events).toHaveLength(foreignBefore);
    await f.authority.consumer.release(f.reserved.reservation);
    await foreign.authority.consumer.release(foreign.reserved.reservation);
  });

  it("keeps the legacy runner synchronous start and original thrown error without creating observation credit", async () => {
    const creation = await automationStudioFlowBootstrapCreationPurse({ store: await store(0), projectId: PROJECT, flowId: FLOW, repair: true, flowPurse: false, ceilingUsd: 1 });
    const failure = new Error("controlled original legacy reading failed");
    let calls = 0;
    const reading = creation.reading((_request: object) => {
      calls++;
      throw failure;
    });
    const running = reading({});
    expect(calls).toBe(1);
    await expect(running).rejects.toBe(failure);
    expect(creation.readingRefused).toBeUndefined();
  });
});
