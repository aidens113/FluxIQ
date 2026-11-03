import { expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../runtime/automation-host/index.ts";
import { enteredObservationFixture } from "../../../../runtime/execution-observation/tests/frame.ts";
import { automationStudioHostActLanded } from "../host-act-landed.ts";

const input = { node: { id: "step", definitionId: "example.step" }, attemptId: "attempt", timeoutMs: 0 };

it.each(["own", "inherited"] as const)("fences the actual act-landed adapter's %s getter", async placement => {
  const f = await enteredObservationFixture();
  let reads = 0;
  await f.run(async observation => {
    const owner = { capabilities: [] };
    Object.defineProperty(owner, "actLanded", { get() {
      reads++;
      return () => "not_landed";
    } });
    const host: AutomationStudioHostRuntimeBoundary = placement === "own" ? owner : Object.create(owner);
    await expect(automationStudioHostActLanded(host, input, observation)).rejects.toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  await f.pending();
});

it("retains the private receiver, exact request and missing/unobserved outcomes", async () => {
  const f = await enteredObservationFixture();
  class Host {
    readonly capabilities = [];
    #calls = 0;
    get calls() { return this.#calls; }
    actLanded(received: typeof input) {
      this.#calls++;
      expect(received).toBe(input);
      expect(arguments.length).toBe(1);
      return "landed" as const;
    }
  }
  const host = new Host();
  f.source.manage({ receiver: host, callback: host.actLanded, contract: "no_direct_effects" });
  await f.run(async observation => { expect(await automationStudioHostActLanded(host, input, observation)).toBe("landed"); });
  expect(host.calls).toBe(1);
  expect(await automationStudioHostActLanded(undefined, input)).toBe("unknown");
  const legacy = { capabilities: [], get actLanded() { return host.actLanded.bind(host); } };
  expect(await automationStudioHostActLanded(legacy, input)).toBe("landed");
});
