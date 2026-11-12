import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../run-gate.ts";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatch = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;
const node = { id: "save", label: "Save", definitionId: "domain.save", parameterValues: { selector: "#save", element: { text: "Save" } }, metadata: { declaredConsequences: ["modify_existing"] } };
const request = { node, inputs: {} } as unknown as Parameters<Native>[0];
const effect = { type: "policy.output.dispatch", payload: { outputId: "domain.save", parameters: node.parameterValues } };
const success = { status: "success" as const, route: "success", outputs: {} };

function gate(record: AutomationStudioAttemptActRecord, kind: "native" | "output" | "core", fail?: Error) {
  const options = automationStudioAnswerFirstRunActGate({
    nativeNodeExecutor: async () => {
      if (fail && kind === "native") throw fail;
      return { result: { ...success, ...(kind === "output" ? { effects: [effect] } : {}) } };
    },
    effectDispatcher: async () => {
      if (fail) throw fail;
      return success;
    }
  }, { record, settle: true });
  return async () => {
    if (kind === "native") return await options.nativeNodeExecutor!(request);
    if (kind === "output") await options.nativeNodeExecutor!(request);
    else options.resolveActionEffect?.(node, node.parameterValues);
    return await options.effectDispatcher!(effect, {} as Parameters<Dispatch>[1]);
  };
}

describe("replay settlement durability", () => {
  it.each(["native", "output", "core"] as const)("holds %s evidence until the landed record commits", async (kind) => {
    let reached = (): void => undefined;
    let commit = (): void => undefined;
    const writing = new Promise<void>((resolve) => { reached = resolve; });
    const allowed = new Promise<void>((resolve) => { commit = resolve; });
    const record = new AutomationStudioAttemptActRecord({ persist: async (data) => {
      if (data.acts[0]?.state === "landed") {
        reached();
        await allowed;
      }
    } });
    let returned = false;
    const running = gate(record, kind)().then(() => { returned = true; });
    await writing;
    await Promise.resolve();
    const beforeCommit = returned;
    commit();
    await running;
    expect(beforeCommit).toBe(false);
  });

  it.each(["native", "output", "core"] as const)("preserves %s dispatch failure alongside failed uncertainty persistence", async (kind) => {
    const dispatch = new Error("dispatch answer lost");
    const storage = new Error("uncertainty write failed");
    let writes = 0;
    const record = new AutomationStudioAttemptActRecord({ persist: async () => { if (++writes > 1) throw storage; } });
    const failure = await gate(record, kind, dispatch)().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([dispatch, storage]);
  });

  it("propagates a native withdrawal persistence failure", async () => {
    const storage = new Error("withdrawal write failed");
    const record = new AutomationStudioAttemptActRecord({ persist: async (data) => { if (!data.acts.length) throw storage; } });
    const options = automationStudioAnswerFirstRunActGate({ nativeNodeExecutor: async () => undefined }, { record, settle: true });
    await expect(options.nativeNodeExecutor!(request)).rejects.toBe(storage);
  });
});
