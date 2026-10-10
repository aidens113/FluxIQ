import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStepRecovery } from "../recovery.ts";

// C11: a step row says how one recovery settled with closed fields, so the
// extension renders a card from them rather than parsing Core's sentence.
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inRun = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b-recovery", projectId: "p1" }, async () => fn());

describe("emitAutomationStudioActivityStepRecovery", () => {
  it("puts a handler recovery on a step row about the node it recovered", async () => {
    await inRun(() => emitAutomationStudioActivityStepRecovery({ nodeId: "node.add", recovery: { kind: "handler", subject: "Dismiss the sign-in popup", outcome: "succeeded", event: "before", targetId: "handler.popup" } }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      phase: "running",
      label: "Recovered: Dismiss the sign-in popup",
      detail: { kind: "step", title: "Dismiss the sign-in popup", status: "succeeded", ref: "node.add", recovery: { kind: "handler", subject: "Dismiss the sign-in popup", outcome: "succeeded", event: "before", targetId: "handler.popup" } }
    });
    expect(seen[0]).not.toHaveProperty("step");
  });

  it("keeps the run repairing when a recovery failed or was refused, and drops an event off a handler", async () => {
    await inRun(() => {
      emitAutomationStudioActivityStepRecovery({ nodeId: "node.pay", recovery: { kind: "route", subject: "Back to the cart", outcome: "refused", event: "fail", targetId: "checkpoint.cart" } });
      emitAutomationStudioActivityStepRecovery({ nodeId: "node.pay", recovery: { kind: "alternative", subject: "  ", outcome: "failed" } });
    });
    expect(seen.map((event) => [event.phase, event.label, event.detail?.status])).toEqual([
      ["repairing", "Recovery not tried: Back to the cart", "failed"],
      ["repairing", "Recovery did not work: Another way", "failed"]
    ]);
    expect(seen[0]?.detail?.recovery).toEqual({ kind: "route", subject: "Back to the cart", outcome: "refused", targetId: "checkpoint.cart" });
  });

  it("is bounded: the subject is cut to the title's bound and a target that is not an id is dropped", async () => {
    await inRun(() => emitAutomationStudioActivityStepRecovery({ nodeId: "node.add", recovery: { kind: "entry", subject: "x".repeat(400), outcome: "succeeded", targetId: "not an id" } }));
    const recovery = seen[0]?.detail?.recovery;
    expect(recovery?.subject).toHaveLength(160);
    expect(recovery).not.toHaveProperty("targetId");
  });

  it("emits nothing outside a unit of work", () => {
    emitAutomationStudioActivityStepRecovery({ nodeId: "node.add", recovery: { kind: "handler", subject: "Dismiss", outcome: "succeeded" } });
    expect(seen).toEqual([]);
  });
});
