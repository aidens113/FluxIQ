import { describe, expect, it, vi } from "vitest";
import type { ExecutionEntry } from "../../../../../../runtime/execution-admission/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/harness-options/index.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../../../llm/domain-instructions/index.ts";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { AutomationStudioSiteResetStartCheck } from "../../site-reset/index.ts";
import { AutomationStudioSiteResetObservation, invokeAutomationStudioSiteResetCallback } from "../index.ts";

describe("the actual original start-state producer", () => {
  it("preserves the private original receiver and gives distinct reads children of their actual reader frame on one Root", async () => {
    class Host implements AutomationStudioLlmEvidenceRuntimeBinding {
      readonly domainId = "isolated";
      readonly tools = [];
      readonly deniedEvidenceKeys = [];
      #reads = 0;
      get reads() { return this.#reads; }
      executeTool(): Promise<never> { throw new Error("this subject never invokes a tool"); }
      async startState() {
        this.#reads += 1;
        return { state: { reading: this.#reads }, differs: [] };
      }
    }
    const host = new Host();
    const f = await buildToolFixture(undefined, callbacks => callbacks.manage({ receiver: host, callback: host.startState, contract: "no_direct_effects" }));
    const prepared: { callback: object; entry: ExecutionEntry }[] = [];
    const originalPrepare = f.callbacks.prepare.bind(f.callbacks);
    vi.spyOn(f.callbacks, "prepare").mockImplementation(async (...args) => {
      const actual = await originalPrepare(...args);
      prepared.push({ callback: args[1].callback, entry: f.callbacks.context(actual).parent });
      return actual;
    });
    const snapshot = automationStudioLlmEvidenceRuntimeBindingChecked(host);
    const reader = new AutomationStudioSiteResetStartCheck({ binding: snapshot, projectId: "project.isolated", flowId: "flow.actual", tools: [], executeTool: async () => { throw new Error("unexpected tool"); }, toolObserver: f.observer, liveCheck: { settleMs: 0 } });
    const options = Object.freeze({});
    const read = async () => {
      const invocation = Object.freeze({});
      return await invokeAutomationStudioSiteResetCallback(options, { receiver: reader, callback: reader.settled, args: [undefined, undefined, invocation] }, undefined, invocation);
    };
    f.callbacks.manage({ receiver: undefined, callback: read, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
    let scope: AutomationStudioSiteResetObservation | undefined;
    try {
      expect(await f.roots.invoke({ receiver: undefined, callback: read, args: [] }, undefined, { prepared: async (parent, originalRoot) => {
        await f.observer.prepareParent(options, parent, originalRoot);
        scope = new AutomationStudioSiteResetObservation(options, { parent, callbacks: f.callbacks, automation: undefined, originalRoot, toolObserver: f.observer, toolRequest: options });
      } })).toMatchObject({ state: { reading: 2 } });
    } finally { scope?.close(); }
    expect(host.reads).toBe(2);
    expect(f.issued).toHaveLength(1);
    const readerFrame = prepared.find(row => row.callback === reader.settled);
    expect(readerFrame).toBeDefined();
    if (!readerFrame) throw new Error("the actual reader frame did not enter");
    const readerRow = f.assembly.entryBridge.read(readerFrame.entry).row;
    const rawReads = prepared.filter(row => row.callback === Host.prototype.startState);
    expect(rawReads).toHaveLength(2);
    expect(rawReads.map(row => f.assembly.entryBridge.read(row.entry).row.parentId)).toEqual([readerRow.entryId, readerRow.entryId]);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it.each(["throw", "fulfilled_without_receipt"] as const)("retains real unknown %s history and refuses copied calls, changed input and a reopened owner before a second send", async outcome => {
    let writes = 0;
    const host: AutomationStudioLlmEvidenceRuntimeBinding = {
      domainId: "isolated", tools: [], deniedEvidenceKeys: [], executeTool: async () => { throw new Error("unexpected tool"); },
      startState: async () => {
        writes += 1;
        if (outcome === "throw") throw new Error("synthetic acknowledgement lost after the real write");
        return { state: { completed: true }, differs: [] };
      }
    };
    const f = await buildToolFixture();
    const reader = new AutomationStudioSiteResetStartCheck({ binding: host, projectId: "project.isolated", flowId: "flow.actual", tools: [], executeTool: async () => { throw new Error("this state-only subject never invokes a tool"); }, toolObserver: f.observer });
    const options = Object.freeze({});
    const invocation = Object.freeze({});
    const read = async () => await invokeAutomationStudioSiteResetCallback(options, { receiver: reader, callback: reader.read, args: [undefined, undefined, invocation] }, undefined, invocation);
    f.callbacks.manage({ receiver: undefined, callback: read, contract: "managed_direct_effects", consumeCompletion: ({ invocation: actual }) => f.callbacks.frameCompletion(actual) });
    let scope: AutomationStudioSiteResetObservation | undefined;
    try {
      const first = await f.roots.invoke({ receiver: undefined, callback: read, args: [] }, undefined, { prepared: async (parent, originalRoot) => {
        await f.observer.prepareParent(options, parent, originalRoot);
        scope = new AutomationStudioSiteResetObservation(options, { parent, callbacks: f.callbacks, automation: undefined, originalRoot, toolObserver: f.observer, toolRequest: options });
      } });
      expect(first).toMatchObject(outcome === "throw" ? { unread: "failed" } : { state: { completed: true } });
    } finally { scope?.close(); }
    expect(writes).toBe(1);
    expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
    expect(await reader.read({ changed: true }, undefined, { ...invocation })).toEqual({ unread: "failed" });
    expect(writes).toBe(1);
    const reopened = await buildToolFixture(f.store);
    const later = new AutomationStudioSiteResetStartCheck({ binding: host, projectId: "project.isolated", flowId: "flow.actual", tools: [], executeTool: async () => { throw new Error("this state-only subject never invokes a tool"); }, toolObserver: reopened.observer });
    expect(await later.read({ changedAgain: true })).toEqual({ unread: "failed" });
    expect(writes).toBe(1);
    expect((await reopened.assembly.consumer.inspect(reopened.scope)).state).toBe("pending");
  });
});
