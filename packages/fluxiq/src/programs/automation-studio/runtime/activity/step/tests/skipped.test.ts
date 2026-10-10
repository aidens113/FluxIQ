import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS, type ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStepSkipped } from "../skipped.ts";

// t416: a step skipped rather than run says so in a closed field, so a client
// never has to tell it from the row's shape.
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "run", id: "r-skipped", projectId: "p1" }, async () => fn());

describe("emitAutomationStudioActivityStepSkipped", () => {
  it("says an already-done step as a succeeded step row about the node, numbered, carrying the skip and its row", async () => {
    const step = { index: 4, count: 6, nodeId: "n4.confirm", label: "Confirm", row: "Lin Zhao" };
    await inRun(() => emitAutomationStudioActivityStepSkipped({ nodeId: "n4.confirm", said: "Already done for Lin Zhao", skipped: { reason: "already_done", subject: "Lin Zhao" }, step }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      phase: "running",
      label: "Already done for Lin Zhao",
      step,
      detail: { kind: "step", title: "Already done for Lin Zhao", status: "succeeded", ref: "n4.confirm", skipped: { reason: "already_done", subject: "Lin Zhao" } }
    });
    expect(seen[0]?.detail).not.toHaveProperty("text");
    expect(seen[0]?.detail).not.toHaveProperty("recovery");
  });

  it("leaves out a blank subject and names no step when it has none", async () => {
    await inRun(() => emitAutomationStudioActivityStepSkipped({ nodeId: "n2", said: "Skipped a step", skipped: { reason: "optional_absent", subject: "   " } }));
    expect(seen[0]).not.toHaveProperty("step");
    expect(seen[0]?.detail?.skipped).toEqual({ reason: "optional_absent" });
  });

  it("names the contract's three reasons", () => {
    expect([...CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS]).toEqual(["already_done", "optional_absent", "state_routed"]);
  });
});
