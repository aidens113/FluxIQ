import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS, automationStudioAuthoredPaceMs, automationStudioPaceKeeper, automationStudioRunWait } from "../index.ts";

const node = (metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode => ({ id: "act", definitionId: "custom.act", ...(metadata ? { metadata } : {}) });

describe("a node's authored pace", () => {
  it.each([[5_000, 5_000], [0, undefined], [-1, undefined], [1.5, undefined], ["5000", undefined], [undefined, undefined]])("reads metadata.paceMs %s as %s", (value, expected) => {
    expect(automationStudioAuthoredPaceMs(node(value === undefined ? undefined : { paceMs: value }))).toBe(expected);
  });
});

describe("the pace keeper", () => {
  it("lets a node's first start through, then holds the next to the pace", async () => {
    const keeper = automationStudioPaceKeeper(), waits: number[] = [];
    let t = 0;
    const wait = async (ms: number) => { waits.push(ms); t += ms; };
    expect(await keeper.before(node({ paceMs: 1_000 }), () => t, wait)).toEqual({ inForceMs: 1_000, waitedMs: 0 });
    keeper.started(node(), t);
    t += 400;
    expect(await keeper.before(node(), () => t, wait)).toEqual({ inForceMs: 1_000, waitedMs: 600 });
    expect(waits).toEqual([600]);
  });

  it("learns the hint, grows by half on each further hint, and stops at the learned ceiling", () => {
    const keeper = automationStudioPaceKeeper();
    expect(keeper.learn(node(), 30_000)).toBe(30_000);
    expect(keeper.learn(node(), 1_000)).toBe(45_000);
    expect(keeper.learn(node(), 1_000)).toBe(AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS);
    expect(keeper.learn(node(), 1_000)).toBeUndefined();
    expect(keeper.summary()).toEqual([{ nodeId: "act", paceMs: AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS, learnedMs: AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS, raisedCount: 3, waitedMs: 0 }]);
  });

  it("learns the spacing the earlier starts and the refusal imply, not the one hinted wait (t485, D1)", () => {
    // A site allowing three acts in any 15 s: starts 4.5 s apart, the fourth refused and told to wait 1.5 s.
    const keeper = automationStudioPaceKeeper();
    for (const at of [0, 4_500, 9_000, 13_500]) keeper.started(node(), at);
    // 15 s over the three acts it let through is 5 s each, and the pace keeps a tenth above it.
    expect(keeper.learn(node(), 1_500, 13_500)).toBe(5_500);
  });

  it("learns the cooldown a lone earlier start implies", () => {
    const keeper = automationStudioPaceKeeper();
    for (const at of [0, 1_000]) keeper.started(node(), at);
    // Let through at 0, refused at 1 s until 10 s: one act per 10 s.
    expect(keeper.learn(node(), 9_000, 1_000)).toBe(11_000);
  });

  it("keeps the hint when no earlier start explains the refusal, and backs off on a further one", () => {
    const keeper = automationStudioPaceKeeper();
    keeper.started(node(), 0);
    expect(keeper.learn(node(), 2_000, 0)).toBe(2_000);
    keeper.started(node(), 2_000);
    keeper.started(node(), 4_000);
    // Refused again: the pace in force was not enough, so it grows by half at least.
    expect(keeper.learn(node(), 500, 4_000)).toBe(3_000);
  });

  it("reads the refusal's time from the run's clock when the caller gives none", async () => {
    const keeper = automationStudioPaceKeeper();
    let t = 0;
    const wait = async (ms: number) => {
      t += ms;
    };
    for (const at of [0, 4_500, 9_000, 13_500]) {
      t = at;
      await keeper.before(node(), () => t, wait);
      keeper.started(node(), at);
    }
    expect(keeper.learn(node(), 1_500)).toBe(5_500);
  });

  it("never lowers an authored pace past the learned ceiling, and ignores a hint that is no wait", () => {
    const keeper = automationStudioPaceKeeper();
    const slow = node({ paceMs: 90_000 });
    expect(keeper.learn(slow, 5_000)).toBeUndefined();
    expect(keeper.learn(slow, Number.NaN)).toBeUndefined();
    expect(keeper.summary()).toEqual([{ nodeId: "act", paceMs: 90_000, authoredMs: 90_000, raisedCount: 0, waitedMs: 0 }]);
  });
});

describe("the run's wait", () => {
  it("ends at once when the run is cancelled, without its own timer holding it", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = automationStudioRunWait({ signal: controller.signal }, 60_000);
    controller.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
