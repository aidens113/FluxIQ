import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityClearedWait } from "../cleared-wait.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

async function inRun(fn: () => void): Promise<void> {
  await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, async () => fn());
}

describe("the pair for a wait that cleared by itself", () => {
  it("is said under the caller's ref, settled in the caller's phase", async () => {
    await inRun(() => emitAutomationStudioActivityClearedWait("waited-out.n.attempt.1", { waitedMs: 2_600 }, "running"));
    expect(seen.map((event) => [event.phase, event.detail?.kind, event.detail?.status, event.detail?.ref, event.detail?.resolution, event.detail?.text])).toEqual([
      ["waiting_permission", "ask", "started", "waited-out.n.attempt.1", undefined, undefined],
      ["running", "ask", "succeeded", "waited-out.n.attempt.1", "waited_out", "The check cleared on its own after 3 s."]
    ]);
  });

  it.each<[string, unknown]>([["absent", undefined], ["a string", "1"], ["a fraction", { waitedMs: 1.5 }], ["Infinity", { waitedMs: Infinity }]])("says nothing for %s", async (_name, clearedWait) => {
    await inRun(() => emitAutomationStudioActivityClearedWait("r", clearedWait, "running"));
    expect(seen).toEqual([]);
  });
});
