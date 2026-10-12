import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStepInterference } from "../interference.ts";

// C11: a layer the client closed over the page is said as a step recovery in
// Core's own words, never the dismiss control's.
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "run", id: "r-interference", projectId: "p1" }, async () => fn());

describe("emitAutomationStudioActivityStepInterference", () => {
  it("says one closed notice as an interference recovery that succeeded, about the node", async () => {
    await inRun(() => emitAutomationStudioActivityStepInterference({ nodeId: "node.search", kinds: ["dialog"] }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      phase: "running",
      label: "Recovered: Closed a notice the page put in the way",
      detail: {
        kind: "step",
        title: "Closed a notice the page put in the way",
        status: "succeeded",
        ref: "node.search",
        recovery: { kind: "interference", subject: "Closed a notice the page put in the way", outcome: "succeeded" }
      }
    });
    expect(seen[0]?.detail?.recovery).not.toHaveProperty("event");
  });

  it.each<[Parameters<typeof emitAutomationStudioActivityStepInterference>[0]["kinds"][number], string]>([
    ["consent", "Closed a consent notice the page put in the way"],
    ["rate_limit", "Closed a slow-down notice the page put in the way"],
    ["promotion", "Closed a promotion the page put in the way"],
    ["assistant", "Closed a chat window the page put in the way"]
  ])("names a closed %s in Core's words", async (kind, subject) => {
    await inRun(() => emitAutomationStudioActivityStepInterference({ nodeId: "n", kinds: [kind] }));
    expect(seen[0]?.detail?.recovery?.subject).toBe(subject);
  });

  it("counts several layers in one row", async () => {
    await inRun(() => emitAutomationStudioActivityStepInterference({ nodeId: "n", kinds: ["consent", "promotion", "dialog"] }));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.detail?.recovery?.subject).toBe("Closed 3 notices the page put in the way");
  });

  it("says nothing when no layer was closed", async () => {
    await inRun(() => emitAutomationStudioActivityStepInterference({ nodeId: "n", kinds: [] }));
    expect(seen).toEqual([]);
  });
});
