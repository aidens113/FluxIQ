import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioBuildToolFactories } from "../../../../../../runtime/flow-authoring/execution/tools/forwarding/index.ts";
import { buildToolFixture } from "../../../build-execution/tools/tests/fixture.ts";
import { AutomationStudioSiteResetStartCheck, automationStudioSiteResetPlacedCall } from "../index.ts";

it.each([false, true])("keeps baseline and settled reads under the original entered tool root (lasting: %s)", async lasting => {
  const asked: unknown[] = [];
  const binding = {
    async startState(this: unknown, request: { callId: string }) {
      expect(this).toBe(binding);
      asked.push(request);
      return { state: {}, differs: [], scope: "example:place", location: "place" };
    }
  };
  const f = await buildToolFixture(undefined, callbacks => {
    callbacks.manage({ receiver: binding, callback: binding.startState, contract: "no_direct_effects" });
  });
  const reader = new AutomationStudioSiteResetStartCheck({
    binding, projectId: "project.isolated", flowId: "flow.actual", tools: [],
    executeTool: async () => ({}), toolObserver: f.observer
  });
  const value: JsonObject = lasting ? { consequences: ["create_new"] } : {};
  const request = { callId: "original.reads", toolId: lasting ? "core.run_node" : "example.observe", value };
  const returned = Object.freeze({ original: true });
  const observed: unknown[] = [];
  let runs = 0;
  const execute = async (call: typeof request) => await automationStudioSiteResetPlacedCall({
    call, reader, allTools: true,
    ledger: {
      observed: value => { observed.push(value); },
      actOf: () => undefined,
      placed: () => {},
      undoSeen: () => {}
    },
    run: async () => {
      runs += 1;
      return returned;
    }
  });
  AutomationStudioBuildToolFactories.remember(execute, "frame");
  expect(await f.observer.invoke({ receiver: undefined, callback: execute, args: [request] }, request)).toBe(returned);
  expect(runs).toBe(1);
  expect(asked).toHaveLength(2);
  expect(observed).toHaveLength(2);
  expect(f.issued).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
});
