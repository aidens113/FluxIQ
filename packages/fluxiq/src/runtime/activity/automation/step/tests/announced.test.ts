// Round 12, lane D (`run-mv62icw0-070f88ad`): coming back to a For Each to
// leave it said its lower number after the loop's last step. A loop's head is
// said once; every other step each time it runs.
import { describe, expect, it } from "vitest";
import { automationStudioActivityStepAnnounced } from "../index.ts";

describe("whether a step is said as the run reaches it", () => {
  it("says a loop's head the first time only", () => {
    for (const definitionId of ["builtin.control.for-each", "builtin.control.repeat", "builtin.control.loop"]) {
      const head = { id: "head", definitionId };
      expect(automationStudioActivityStepAnnounced(head, [{ nodeId: "open" }])).toBe(true);
      expect(automationStudioActivityStepAnnounced(head, [{ nodeId: "open" }, { nodeId: "head" }, { nodeId: "body" }])).toBe(false);
    }
  });

  it("says any other step each time, a retry or the next pass included", () => {
    expect(automationStudioActivityStepAnnounced({ id: "body", definitionId: "web.output.dom-click" }, [{ nodeId: "body" }, { nodeId: "body" }])).toBe(true);
  });
});
