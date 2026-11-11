// The judge's question as it is sent with no overrides (W3, t899, B3a): pinned whole, with no frame and an empty one.
import { describe, expect, it } from "vitest";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const summary: AutomationStudioFlowLessSummary = { instructions: "List the open bookings.", acts: [] };
const sent = () => JSON.stringify(automationStudioFlowLessJudgedSummary(summary, []).sent, null, 2);

describe.each([
  ["no frame", (fn: () => string) => fn()],
  ["an empty frame", (fn: () => string) => runWithAutomationStudioRunOverrides({}, fn)]
])("the judge's question with %s", (_name, within) => {
  it("is the summary it is sent, question first, whole", async () => {
    await expect(within(sent)).toMatchFileSnapshot("./__snapshots__/judged-summary.json");
  });
});

describe("the judge's question under a run's overrides (judge.question is open)", () => {
  const question = (frame: Parameters<typeof runWithAutomationStudioRunOverrides>[0]) =>
    runWithAutomationStudioRunOverrides(frame, () => (automationStudioFlowLessJudgedSummary(summary, []).sent as unknown as { question: string }).question);
  const base = question({});

  it("takes an append after the default, a replacement in its place, and criteria after either", () => {
    expect(question({ prompts: { "judge.question": { mode: "append", text: "Bookings must be open today." } } })).toBe(`${base}\n\nBookings must be open today.`);
    expect(question({ prompts: { "judge.question": { mode: "replace", text: "Is every open booking listed?" } } })).toBe("Is every open booking listed?");
    expect(question({ prompts: { "judge.question": { mode: "replace", text: "Is every open booking listed?" } }, judgeCriteria: ["Dates are ISO."] })).toMatch(/^Is every open booking listed\?\n\n.*Dates are ISO\./su);
  });
});
