import { expect, it } from "vitest";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";
import { dispatchAutomationStudioLifecycleEvent } from "../index.ts";
import { dispatchInput, flowWith, framed, handler } from "./lifecycle-fixtures.ts";

it.each(["own", "inherited"] as const)("refuses a %s lifecycle timestamp accessor before a handler runs", async placement => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  await f.run(async options => {
    const flow = flowWith("flow.clock-properties", [handler("h", { event: "retry", scope: { kind: "nodes", nodeIds: ["press"] }, when: [], completionCheck: [] }, { disposition: "resume" })]);
    options.invocation = framed(flow);
    const owner = placement === "own" ? options : {};
    if (placement === "inherited") Object.setPrototypeOf(options, owner);
    Object.defineProperty(owner, "now", { get() {
      reads++;
      return () => 1;
    } });
    await expect(dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, options, { event: "retry" }))).rejects.toThrow("callback_accessor_unsupported");
    expect(options.invocation.run.lifecycle.executions).toHaveLength(0);
  });
  expect(reads).toBe(0);
  await f.pending();
});
