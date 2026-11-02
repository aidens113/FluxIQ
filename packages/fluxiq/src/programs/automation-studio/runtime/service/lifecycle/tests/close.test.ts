import { expect, it } from "vitest";
import { closeAutomationStudioRuntimeResources } from "../index.ts";

it("awaits each close in order and preserves every failure", async () => {
  const calls: string[] = [], first = new Error("first"), last = new Error("last");
  const close = closeAutomationStudioRuntimeResources([
    async () => {
      calls.push("first");
      throw first;
    },
    async () => {
      await Promise.resolve();
      calls.push("middle");
    },
    () => {
      calls.push("last");
      throw last;
    }
  ]);
  await expect(close).rejects.toMatchObject({ message: "automation_studio.close_failed", errors: [first, last] });
  expect(calls).toEqual(["first", "middle", "last"]);
});
