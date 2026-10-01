import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityActionKey, activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityWaitedOut } from "../waited-out.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const result = (clearedWait?: unknown) => ({
  kind: "llm_evidence_tool_execution",
  evidence: {},
  effectApplied: false,
  resultCode: "web.output.dom-click.clicked",
  ...(clearedWait === undefined ? {} : { clearedWait })
});

async function inBuild(fn: () => void): Promise<void> {
  await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => fn());
}

describe("a check that cleared by itself", () => {
  it("is said as a wait opened and waited out, one card, with how long it stood", async () => {
    await inBuild(() => emitAutomationStudioActivityWaitedOut("call.7", result({ waitedMs: 4_400 }), "exploring"));
    expect(seen.map((event) => [event.phase, event.detail?.kind, event.detail?.status, event.detail?.ref, event.detail?.resolution])).toEqual([
      ["waiting_permission", "ask", "started", "waited-out.call.7", undefined],
      ["exploring", "ask", "succeeded", "waited-out.call.7", "waited_out"]
    ]);
    const [waiting, resolved] = seen;
    expect(resolved!.detail!.title).toBe(waiting!.detail!.title);
    expect(resolved!.detail!.text).toBe("The check cleared on its own after 4 s.");
    expect(resolved!.label).toBe("The check cleared on its own after 4 s.");
    expect(activityActionOf(waiting!)).toMatchObject({ kind: "person_check", outcome: "waiting" });
    expect(activityActionOf(resolved!)).toMatchObject({ kind: "person_check", outcome: "done", why: null });
    expect(activityActionKey(resolved!)).toBe(activityActionKey(waiting!));
  });

  it.each([[0, "1 s"], [499, "1 s"], [1_500, "2 s"], [61_000, "61 s"]])("says %i ms as %s", async (waitedMs, said) => {
    await inBuild(() => emitAutomationStudioActivityWaitedOut("c", result({ waitedMs }), "exploring"));
    expect(seen[1]!.detail!.text).toBe(`The check cleared on its own after ${said}.`);
  });

  it("says nothing when the result reports no cleared wait", async () => {
    await inBuild(() => emitAutomationStudioActivityWaitedOut("c", result(), "exploring"));
    expect(seen).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["a string", "4400"],
    ["an array", [4_400]],
    ["no waitedMs", {}],
    ["a string waitedMs", { waitedMs: "4400" }],
    ["a fraction", { waitedMs: 4_400.5 }],
    ["a negative", { waitedMs: -1 }],
    ["more than a day", { waitedMs: 24 * 60 * 60 * 1000 + 1 }],
    ["not a number", { waitedMs: Number.NaN }],
    ["infinity", { waitedMs: Number.POSITIVE_INFINITY }]
  ])("says nothing for a malformed field: %s", async (_name, clearedWait) => {
    await inBuild(() => emitAutomationStudioActivityWaitedOut("c", result(clearedWait), "exploring"));
    expect(seen).toEqual([]);
  });

  it("says nothing for a result that is not a tool execution result", async () => {
    await inBuild(() => {
      emitAutomationStudioActivityWaitedOut("c", { clearedWait: { waitedMs: 4_400 } }, "exploring");
      emitAutomationStudioActivityWaitedOut("c", null, "exploring");
      emitAutomationStudioActivityWaitedOut("c", [result({ waitedMs: 4_400 })], "exploring");
    });
    expect(seen).toEqual([]);
  });

  it("says nothing outside a unit of work", () => {
    emitAutomationStudioActivityWaitedOut("c", result({ waitedMs: 4_400 }), "exploring");
    expect(seen).toEqual([]);
  });
});
