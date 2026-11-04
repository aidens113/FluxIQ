// An answer-first attempt does the task rather than build a Flow, so its activity says neither that
// a Flow is being built nor that one is ready (t861). Any other build keeps its words.
import { describe, expect, it } from "vitest";
import { automationStudioActivityHub, withAutomationStudioBuildActivity } from "../index.ts";

async function labelsOf(target: { projectId: string; authoringMode?: string }, built: unknown): Promise<string[]> {
  const labels: string[] = [];
  const stop = automationStudioActivityHub.subscribe((activity) => { labels.push(activity.label); });
  try { await withAutomationStudioBuildActivity(target, async () => built); }
  finally { stop(); }
  return labels;
}

describe("what an answer-first attempt's activity says", () => {
  it.each([
    ["achieved", "Finished"],
    ["budget_out", "Reached this task's budget"],
    ["stopped_by_person", "Stopped"],
    ["waiting_for_person", "Waiting for you"]
  ])("ends %s in a person's words, with no Flow in them", async (status, ending) => {
    const labels = await labelsOf({ projectId: "p1", authoringMode: "answer-first" }, { status: "answered", attempt: { status } });
    expect(labels).toEqual(["Working on your task", ending]);
  });

  it("says a setup step is not a Flow being ready", async () => {
    const labels = await labelsOf({ projectId: "p1", authoringMode: "answer-first" }, { status: "setup_needed", say: "Add a model key in settings." });
    expect(labels).toEqual(["Working on your task", "Before I can start"]);
  });

  it("leaves any other build's words as they were", async () => {
    expect(await labelsOf({ projectId: "p1" }, { status: "proposed" })).toEqual(["Building the Flow", "Your Flow is ready"]);
  });
});
