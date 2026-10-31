// A rate limit that stated no wait still slows its node (P6, CC8, t799): the
// pace grows by half again from a floor of a second, up to the learned ceiling,
// and never falls below an authored pace.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS, automationStudioPaceAfterRateLimit, automationStudioPaceKeeper } from "../index.ts";

const node = (metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode => ({ id: "borrow", definitionId: "custom.borrow", ...(metadata ? { metadata } : {}) });

describe("a pace learned without a wait hint", () => {
  it("starts at a second for a node with no pace, then grows by half again each time", () => {
    const keeper = automationStudioPaceKeeper();
    expect(keeper.learnUnhinted(node())).toBe(1_000);
    expect(keeper.learnUnhinted(node())).toBe(1_500);
    expect(keeper.learnUnhinted(node())).toBe(2_250);
    expect(keeper.summary()).toEqual([{ nodeId: "borrow", paceMs: 2_250, learnedMs: 2_250, raisedCount: 3, waitedMs: 0 }]);
  });

  it("stops at the learned ceiling and answers nothing once there", () => {
    const keeper = automationStudioPaceKeeper();
    let last: number | undefined;
    for (let step = 0; step < 20; step += 1) last = keeper.learnUnhinted(node()) ?? last;
    expect(last).toBe(AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS);
    expect(keeper.learnUnhinted(node())).toBeUndefined();
  });

  it("grows an authored pace by half and never goes below it", () => {
    const keeper = automationStudioPaceKeeper();
    expect(keeper.learnUnhinted(node({ paceMs: 4_000 }))).toBe(6_000);
    const longer = automationStudioPaceKeeper();
    // An authored pace past the ceiling is the author's: nothing here raises or cuts it.
    expect(longer.learnUnhinted(node({ paceMs: 90_000 }))).toBeUndefined();
    expect(longer.summary()).toEqual([{ nodeId: "borrow", paceMs: 90_000, authoredMs: 90_000, raisedCount: 0, waitedMs: 0 }]);
  });

  it("leaves a hinted learn as it was", () => {
    const keeper = automationStudioPaceKeeper();
    expect(keeper.learn(node(), 30_000)).toBe(30_000);
    expect(keeper.learnUnhinted(node())).toBe(45_000);
  });
});

describe("the pace a rate limit on an attempt raises", () => {
  const attempt = (extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({
    attemptId: "borrow.attempt.1", nodeId: "borrow", definitionId: "custom.borrow", startedAt: 1_000, finishedAt: 1_200, status: "failed", inputs: {}, outputs: {}, effects: [], ...extra
  });

  it("raises it for an obstruction of kind rate_limit that stated no wait, and says so on the attempt", () => {
    const keeper = automationStudioPaceKeeper();
    const raised = automationStudioPaceAfterRateLimit(keeper, node(), attempt({ obstruction: { kind: "rate_limit", dismiss: [] } }));
    expect(raised.pace).toEqual({ inForceMs: 0, waitedMs: 0, raisedToMs: 1_000 });
  });

  it("takes a stated retryAfterMs as a hint", () => {
    const keeper = automationStudioPaceKeeper();
    const raised = automationStudioPaceAfterRateLimit(keeper, node(), attempt({ obstruction: { kind: "rate_limit", retryAfterMs: 7_000, dismiss: [] } }));
    expect(raised.pace?.raisedToMs).toBe(7_000);
  });

  it("raises it for a cleared rate_limit layer on an attempt that went through", () => {
    const keeper = automationStudioPaceKeeper();
    const raised = automationStudioPaceAfterRateLimit(keeper, node(), attempt({ status: "succeeded", clearedLayers: [{ kind: "rate_limit", control: "Close" }], pace: { inForceMs: 0, waitedMs: 0 } }));
    expect(raised.pace).toEqual({ inForceMs: 0, waitedMs: 0, raisedToMs: 1_000 });
  });

  it("returns the very attempt when it met no rate limit and was given no hint", () => {
    const keeper = automationStudioPaceKeeper();
    const plain = attempt({ obstruction: { kind: "overlay", dismiss: [] }, clearedLayers: [{ kind: "notice", control: "Close" }] });
    expect(automationStudioPaceAfterRateLimit(keeper, node(), plain)).toBe(plain);
    expect(keeper.summary()).toBeUndefined();
  });

  it("uses a fault's hint over everything else", () => {
    const keeper = automationStudioPaceKeeper();
    const raised = automationStudioPaceAfterRateLimit(keeper, node(), attempt(), 3_000);
    expect(raised.pace?.raisedToMs).toBe(3_000);
  });
});
