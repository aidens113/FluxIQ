import { expect, it } from "vitest";
import type { ExecutionEntry } from "../../../../../../runtime/execution-admission/index.ts";
import { observationFixture } from "../../../../../../runtime/execution-observation/tests/fixture.ts";
import { automationStudioTrialChangeBegin, automationStudioTrialChangeUnwitnessedSession, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialChangeSession } from "../../trial-change/index.ts";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { AutomationStudioSiteResetCallbackPolicies as Policies, AutomationStudioSiteResetObservation as Scope, AutomationStudioSiteResetSessions as Sessions, finishAutomationStudioSiteResetSession as finish, invokeAutomationStudioSiteResetCallback as invoke } from "../index.ts";

it("finishes canonical sessions under the current original child without reusing their closed before-trial parents or each other's options", async () => {
  const f = await observationFixture();
  const firstOptions = Object.freeze({}), secondOptions = Object.freeze({});
  const seen: { options: object; source: ExecutionEntry; reader: ExecutionEntry }[] = [];
  const port: AutomationStudioTrialChangeLedgerPort = {
    places: () => [{ kind: "control", place: "isolated.choice", location: "isolated.location" }],
    latest: () => undefined, seq: () => 0, leftFromEarlier: () => [], carried: () => false, start: () => ({ before: 1 })
  };
  const factory = {
    async create(options: object) {
      const reader = {
        async read() {
          const current = Scope.of(options), readScope = Scope.of(this);
          if (!current || !readScope) throw new Error("the actual current options and reader scopes are required");
          expect(Scope.of(options === firstOptions ? secondOptions : firstOptions)).toBeUndefined();
          seen.push({ options, source: current.context.parent.parent, reader: readScope.context.parent.parent });
          return { state: {}, differs: [], controls: { "isolated.choice": { before: 1 } } };
        }
      };
      Policies.remember(reader, reader.read, "pure");
      const session = await automationStudioTrialChangeBegin({
        steps: [{ step: 1, definitionId: "isolated.choose", consequences: ["modify_existing"], witness: { original: true }, parts: ["part.actual"] }],
        parts: [{ id: "part.actual", effect: { kind: "end_state", state: "the choice is selected" } }], port,
        look: async () => { await invoke(options, { receiver: reader, callback: reader.read, args: [] }); }
      });
      if (!session) throw new Error("the real canonical control session was not created");
      Sessions.bind(session, options);
      return session;
    }
  };
  Policies.remember(factory, factory.create, "frame");
  const before = Object.freeze({});
  const beforeScope = new Scope(before, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  let first: AutomationStudioTrialChangeSession, second: AutomationStudioTrialChangeSession;
  try {
    first = await invoke(before, { receiver: factory, callback: factory.create, args: [firstOptions] }, undefined, firstOptions);
    second = await invoke(before, { receiver: factory, callback: factory.create, args: [secondOptions] }, undefined, secondOptions);
  } finally { beforeScope.close(); }
  expect(Scope.of(firstOptions)).toBeUndefined();
  expect(Scope.of(secondOptions)).toBeUndefined();
  const beforeEntries = seen.map(row => row.source);
  const foreign = await observationFixture();
  const foreignInvocation = Object.freeze({});
  const foreignScope = new Scope(foreignInvocation, { parent: foreign.parent, callbacks: foreign.source, automation: undefined, originalRoot: foreign.reserved.root });
  try { await expect(finish(foreignInvocation, first, [])).rejects.toThrow("site_reset.session_origin_changed"); }
  finally { foreignScope.close(); }
  const current = Object.freeze({}), actualCall = Object.freeze({});
  const currentScope = new Scope(current, { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root });
  const runner = { async run(request: object, session: AutomationStudioTrialChangeSession) { return await finish(request, session, []); } };
  Policies.remember(runner, runner.run, "frame");
  try {
    await expect(finish({ ...actualCall }, first, [])).rejects.toThrow("site_reset.session_origin_changed");
    const originalFinish = first.finish;
    let getterCalls = 0;
    Object.defineProperty(first, "finish", { configurable: true, get() {
      getterCalls++;
      return originalFinish;
    } });
    await expect(invoke(current, { receiver: runner, callback: runner.run, args: [actualCall, first] }, undefined, actualCall)).rejects.toThrow("site_reset.session_origin_changed");
    expect(getterCalls).toBe(0);
    Object.defineProperty(first, "finish", { configurable: true, writable: true, value: originalFinish });
    const result = await invoke(current, { receiver: runner, callback: runner.run, args: [actualCall, first] }, undefined, actualCall);
    expect(result.siteChange.proofs).toMatchObject([{ part: "part.actual", proof: "unproven" }]);
    await invoke(current, { receiver: runner, callback: runner.run, args: [actualCall, second] }, undefined, actualCall);
    expect(seen).toHaveLength(4);
    for (const row of seen.slice(2)) {
      expect(beforeEntries).not.toContain(row.source);
      expect(f.authority.entryBridge.read(row.reader).row.parentId).toBe(f.authority.entryBridge.read(row.source).row.entryId);
    }
    expect(Scope.of(firstOptions)).toBeUndefined();
    expect(Scope.of(secondOptions)).toBeUndefined();
  } finally { currentScope.close(); }
});

it("does not clear a supplied finish wrapper merely because it returns a genuine canonical packet after writing", async () => {
  const f = await buildToolFixture();
  let writes = 0;
  const session = automationStudioTrialChangeUnwitnessedSession({ session: undefined, steps: [], parts: [], unwitnessed: [], leftFromEarlier: () => [] });
  const original = session.finish;
  session.finish = async function(acts, signal) {
    writes++;
    return await original.call(this, acts, signal);
  };
  const options = Object.freeze({});
  const run = async () => await finish(options, session, []);
  f.callbacks.manage({ receiver: undefined, callback: run, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => f.callbacks.frameCompletion(invocation) });
  let scope: Scope | undefined;
  try {
    expect(await f.roots.invoke({ receiver: undefined, callback: run, args: [] }, undefined, { prepared: (parent, originalRoot) => {
      scope = new Scope(options, { parent, callbacks: f.callbacks, automation: undefined, originalRoot });
    } })).toMatchObject({ siteChange: { proofs: [] } });
  } finally { scope?.close(); }
  expect(writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  await expect(f.roots.invoke({ receiver: undefined, callback: run, args: [] })).rejects.toThrow();
  const reopened = await buildToolFixture(f.store);
  await expect(reopened.roots.invoke({ receiver: undefined, callback: run, args: [] })).rejects.toThrow();
  expect(writes).toBe(1);
});
