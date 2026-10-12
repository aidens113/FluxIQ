import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStepRecovering } from "../recovering.ts";

// R4a attempt 2, `run-mv2pgqkj-f3552c70`, trial 3 (step 0092) and moment 12:
// the Flow's "clear the quantity field" step (`web.output.dom-clear`) failed
// with `web.validation.output_not_observed` after 4 attempts, the box reading
// "1" again, and the overlay said "A step didn't work in the test: it ran, but
// the page didn't change the way it should have". The row that settles the
// failed step is a `repairing` row, whose card kind is "repair", so the
// reason was never worded for a box.
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inBuild = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b-recovering", projectId: "p1" }, async () => fn());

describe("emitAutomationStudioActivityStepRecovering", () => {
  it("settles a clear step the site set back with a box's words", async () => {
    await inBuild(() => emitAutomationStudioActivityStepRecovering({ nodeId: "n9", label: "clear the quantity field", definitionId: "web.output.dom-clear", parameters: { element: { role: "spinbutton", accessibleName: "Quantity" } }, failureCode: "web.validation.output_not_observed" }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      phase: "repairing",
      label: "Recovering from a failed step: clear the quantity field",
      detail: { kind: "step", status: "failed", ref: "n9", text: "Result: web.validation.output_not_observed · Node: web.output.dom-clear" }
    });
    const card = activityActionOf(seen[0]!);
    expect(card?.outcome).toBe("failed");
    expect(card?.why).toBe("it ran, but the site set the box back");
  });

  it("keeps the page's words for a step that types nothing", async () => {
    await inBuild(() => emitAutomationStudioActivityStepRecovering({ nodeId: "n4", label: "collect the store coupon", definitionId: "web.output.dom-click", failureCode: "web.validation.output_not_observed" }));
    expect(activityActionOf(seen[0]!)?.why).toBe("it ran, but the page didn't change the way it should have");
  });
});
