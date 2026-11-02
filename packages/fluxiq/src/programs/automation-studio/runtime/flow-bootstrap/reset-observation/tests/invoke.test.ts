import { expect, it } from "vitest";
import type { ExecutionEntry } from "../../../../../../runtime/execution-admission/index.ts";
import { observationFixture } from "../../../../../../runtime/execution-observation/tests/fixture.ts";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetLedgerOptions, type AutomationStudioSiteResetTrialAct } from "../../site-reset/index.ts";
import { AutomationStudioSiteResetCallbackPolicies as Policies, AutomationStudioSiteResetObservation as Scope, invokeAutomationStudioSiteResetCallback as invoke, invokeAutomationStudioSiteResetSync as invokeSync } from "../index.ts";

const ACTS: readonly AutomationStudioSiteResetTrialAct[] = [{ step: 1, definitionId: "isolated.save", label: "Save", consequences: ["modify_existing"] }];

it("awaits the original sink's actual commit with its private receiver and original recorded tuple", async () => {
  const f = await observationFixture();
  let commit!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { commit = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  const receipts = new WeakSet<object>();
  let writes = 0, replacementCalls = 0;
  let sinkEntry: ExecutionEntry | undefined;
  const options = {
    nextActId() {
      expect(this).toBe(options);
      return "act-private";
    },
    sink(recorded) {
      expect(this).toBe(options);
      expect(recorded).toEqual({ act: "act-private", did: 'trial step 1 "Save"', ref: "trial.actual#step-1", undoable: true });
      sinkEntry = Scope.of(recorded)?.context.parent.parent;
      expect(sinkEntry).toBeDefined();
      const returned = held.then(() => {
        writes++;
        receipts.add(returned);
      });
      entered();
      return returned;
    }
  } satisfies AutomationStudioSiteResetLedgerOptions;
  Policies.remember(options, options.nextActId, "pure");
  Policies.rememberManaged({ receiver: options, callback: options.sink, contract: "managed_direct_effects", consumeCompletion(input) {
    if (!input.returned || !receipts.delete(input.returned)) return { disposition: "unknown", code: "synthetic.original_commit_missing" };
    return { disposition: "settled", completionDigest: "synthetic.actual_commit", assessmentDigest: "synthetic.original_writer" };
  } });
  const ledger = new AutomationStudioSiteResetLedger(options);
  options.sink = () => {
    replacementCalls++;
    return Promise.resolve();
  };
  const invocation = Object.freeze({}), child = Object.freeze({});
  const scope = new Scope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  let returned = false;
  try {
    const running = invoke(invocation, { receiver: ledger, callback: ledger.trialRanObserved, args: [ACTS, "trial.actual", child] }, undefined, child).then(value => {
      returned = true;
      return value;
    });
    await called;
    expect(returned).toBe(false);
    expect(writes).toBe(0);
    expect(replacementCalls).toBe(0);
    const actualFrame = Scope.of(child)?.context.parent.parent;
    if (!actualFrame || !sinkEntry) throw new Error("the original recording and sink did not enter");
    expect(f.authority.entryBridge.read(sinkEntry).row.parentId).toBe(f.authority.entryBridge.read(actualFrame).row.entryId);
    commit();
    expect(await running).toEqual([{ act: "act-private", did: 'trial step 1 "Save"' }]);
    expect(writes).toBe(1);
    expect(Scope.of(child)).toBeUndefined();
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  } finally { scope.close(); }
});

it.each(["throw", "copied_receipt"] as const)("does not clear an actual sink write followed by %s or send again after release", async outcome => {
  const f = await observationFixture();
  let writes = 0;
  const receipts = new WeakSet<object>();
  const options = {
    sink() {
      writes++;
      if (outcome === "throw") throw new Error("synthetic commit acknowledgement lost");
      const returned = Promise.resolve();
      receipts.add({ ...returned });
      return returned;
    }
  } satisfies AutomationStudioSiteResetLedgerOptions;
  Policies.rememberManaged({ receiver: options, callback: options.sink, contract: "managed_direct_effects", consumeCompletion(input) {
    if (!input.returned || !receipts.delete(input.returned)) return { disposition: "unknown", code: "synthetic.original_commit_missing" };
    return { disposition: "settled", completionDigest: "synthetic.actual_commit", assessmentDigest: "synthetic.original_writer" };
  } });
  const ledger = new AutomationStudioSiteResetLedger(options);
  const invocation = Object.freeze({}), child = Object.freeze({});
  const scope = new Scope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  try {
    const running = invoke(invocation, { receiver: ledger, callback: ledger.trialRanObserved, args: [ACTS, "trial.actual", child] }, undefined, child);
    if (outcome === "throw") await expect(running).rejects.toThrow("synthetic commit acknowledgement lost");
    else expect(await running).toEqual([{ act: "act-1", did: 'trial step 1 "Save"' }]);
    expect(writes).toBe(1);
    await expect(f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin))).rejects.toThrow();
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
    const later = f.root.origin("changed.revision");
    await expect(f.authority.consumer.reserve(f.scope, f.rootPorts.issuer.fromOrdinaryAdmission(f.root.admit(later)))).rejects.toThrow();
    expect(writes).toBe(1);
  } finally { scope.close(); }
});

it.each(["async", "sync"] as const)("preserves an unsupported %s callback's first fulfilled result and blocks fresh ordinary roots and reopened owners before a second write", async kind => {
  const f = await buildToolFixture();
  let writes = 0;
  const supplied = { write() {
    writes++;
    return { written: true };
  } };
  const reader = { read() { return invokeSync(this, { receiver: supplied, callback: supplied.write, args: [] }); } };
  Policies.remember(reader, reader.read, "frame");
  const options = Object.freeze({});
  const run = async () => kind === "async" ? await invoke(options, { receiver: supplied, callback: supplied.write, args: [] }) : await invoke(options, { receiver: reader, callback: reader.read, args: [] });
  f.callbacks.manage({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
  let scope: Scope | undefined;
  try {
    expect(await f.roots.invoke({ receiver: undefined, callback: run, args: [] }, undefined, { prepared: (parent, originalRoot) => {
      scope = new Scope(options, { parent, callbacks: f.callbacks, automation: undefined, originalRoot });
    } })).toEqual({ written: true });
  } finally { scope?.close(); }
  expect(writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.roots.invoke({ receiver: undefined, callback: run, args: [] })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  await expect(reopened.roots.invoke({ receiver: undefined, callback: run, args: [] })).rejects.toThrow();
  expect(writes).toBe(1);
});
