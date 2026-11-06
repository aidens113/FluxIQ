// The attempt says its ending when its answer is stored, and the build does not say it again (t869).
import { describe, expect, it } from "vitest";
import { automationStudioActivityHub, emitAutomationStudioAttemptEnded, withAutomationStudioBuildActivity } from "../index.ts";

type Row = { label: string; phase: string; final?: boolean };

async function rowsOf(target: { projectId: string; authoringMode?: string }, fn: () => Promise<unknown>): Promise<Row[]> {
  const rows: Row[] = [];
  const stop = automationStudioActivityHub.subscribe((activity) => { rows.push({ label: activity.label, phase: activity.phase, ...(activity.final ? { final: true } : {}) }); });
  try { await withAutomationStudioBuildActivity(target, fn); }
  finally { stop(); }
  return rows;
}

const answered = (status: string) => ({ status: "answered", attempt: { status } });

describe("the attempt's closing row", () => {
  it("comes when the answer is stored, before the build returns, and once", async () => {
    const order: string[] = [];
    const stop = automationStudioActivityHub.subscribe((activity) => { if (activity.final) order.push(`row:${activity.label}`); });
    try {
      await withAutomationStudioBuildActivity({ projectId: "p1", authoringMode: "answer-first" }, async () => {
        emitAutomationStudioAttemptEnded(answered("achieved"));
        order.push("returning");
        return answered("achieved");
      });
    } finally { stop(); }
    expect(order).toEqual(["row:Finished", "returning"]);
  });

  it("is the build's whole stream: working, then one closing row", async () => {
    const rows = await rowsOf({ projectId: "p1", authoringMode: "answer-first" }, async () => {
      await Promise.resolve();
      emitAutomationStudioAttemptEnded(answered("budget_out"));
      return answered("budget_out");
    });
    expect(rows).toEqual([{ label: "Working on your task", phase: "building" }, { label: "Reached this task's budget", phase: "done", final: true }]);
  });

  it("is said once even if the attempt reports its ending twice", async () => {
    const rows = await rowsOf({ projectId: "p1", authoringMode: "answer-first" }, async () => {
      emitAutomationStudioAttemptEnded(answered("achieved"));
      emitAutomationStudioAttemptEnded(answered("achieved"));
      return answered("achieved");
    });
    expect(rows.filter((row) => row.final)).toHaveLength(1);
  });

  it("is still said by the build when the attempt did not say it", async () => {
    const rows = await rowsOf({ projectId: "p1", authoringMode: "answer-first" }, async () => answered("stopped_by_person"));
    expect(rows.filter((row) => row.final)).toEqual([{ label: "Stopped", phase: "done", final: true }]);
  });

  it("says nothing outside a build, and one build never marks the next", async () => {
    expect(() => emitAutomationStudioAttemptEnded(answered("achieved"))).not.toThrow();
    await rowsOf({ projectId: "p1", authoringMode: "answer-first" }, async () => {
      emitAutomationStudioAttemptEnded(answered("achieved"));
      return answered("achieved");
    });
    const second = await rowsOf({ projectId: "p1", authoringMode: "answer-first" }, async () => answered("achieved"));
    expect(second.filter((row) => row.final)).toHaveLength(1);
  });

  it("leaves another mode as it was", async () => {
    const rows = await rowsOf({ projectId: "p1" }, async () => ({ status: "proposed" }));
    expect(rows.map((row) => row.label)).toEqual(["Building the Flow", "Your Flow is ready"]);
  });
});
