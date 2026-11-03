import { expect, it } from "vitest";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { automationStudioStepLearnInterruption, automationStudioStepRepairWillAsk } from "../incident-repair.ts";
import { stepPropertyContext } from "./property-context.ts";

it.each(["own", "inherited"] as const)("refuses a %s repair presence getter before a repair runs", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  await f.run(async options => {
    const { ctx, node } = stepPropertyContext(options);
    const owner = placement === "own" ? options : {};
    if (placement === "inherited") Object.setPrototypeOf(options, owner);
    Object.defineProperty(owner, "repairIncident", { get() {
      reads++;
      return async () => ({ kind: "none", reason: "replacement" });
    } });
    expect(() => automationStudioStepRepairWillAsk(ctx, { node, attemptIndex: 0, incidentId: "incident.one", fault: undefined })).toThrow("callback_accessor_unsupported");
  });
  expect(reads).toBe(0);
  await f.pending();
});

it("rechecks a learning callback after the previous layer's callback yields", async () => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    const { ctx, node, attempt } = stepPropertyContext(options);
    attempt.clearedLayers = ["first", "second"].map(name => ({ kind: "dialog", name, wayOut: "control.close", wayOutDefinitionId: "example.close" }));
    const learn = async () => {
      calls++;
      await Promise.resolve();
      Object.defineProperty(options, "learnInterruption", { get() {
        reads++;
        return async () => {
          calls++;
          return { kind: "none" as const, reason: "replacement" };
        };
      } });
      return { kind: "none" as const, reason: "original learner declined" };
    };
    options.learnInterruption = learn;
    f.engine.manage({ receiver: options, callback: learn, contract: "no_direct_effects" });
    await automationStudioStepLearnInterruption(ctx, node, 0);
  });
  expect(reads).toBe(0);
  expect(calls).toBe(1);
  await f.pending();
});

it("retains the first unobserved repair presence getter", () => {
  let reads = 0;
  const options = { get repairIncident() {
    reads++;
    return async () => ({ kind: "none" as const, reason: "legacy" });
  } };
  const { ctx, node } = stepPropertyContext(options);
  expect(automationStudioStepRepairWillAsk(ctx, { node, attemptIndex: 0, incidentId: "incident.one", fault: undefined })).toBe(true);
  expect(reads).toBe(1);
});
