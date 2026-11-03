import { describe, expect, it } from "vitest";
import { automationStudioResultCheckAskId, automationStudioResultCheckTurn, sayAutomationStudioResultCheck, type AutomationStudioResultCheckThread } from "../index.ts";

const found = (overrides: Partial<Parameters<typeof automationStudioResultCheckTurn>[0]> = {}) => ({
  runId: "run.catalogue.1",
  status: "refuted" as const,
  checked: true,
  reason: "The result does not answer the request the Flow was built for.",
  observation: "24 records came back where the request asked for the 13 rated above 4.",
  datasetId: "dataset.listings",
  ...overrides
});

function thread(): AutomationStudioResultCheckThread & { said: unknown[]; asked: unknown[] } {
  const said: unknown[] = [];
  const asked: unknown[] = [];
  return {
    said,
    asked,
    say: async (text, attachment) => { said.push({ text, attachment }); return undefined; },
    ask: async (input) => { asked.push(input); return undefined; }
  };
}

describe("what a result check says to the person", () => {
  it("tells them about a refutation, in Core's words, with the rows that were judged attached", async () => {
    const posted = thread();
    await sayAutomationStudioResultCheck({ thread: posted, found: found() });
    expect(posted.asked).toEqual([]);
    expect(posted.said).toHaveLength(1);
    expect(posted.said[0]).toEqual({
      text: "The result does not answer the request the Flow was built for. 24 records came back where the request asked for the 13 rated above 4.",
      attachment: { kind: "dataset", ref: "dataset.listings" }
    });
  });

  it("asks, without parking, when two calls settled nothing", async () => {
    const posted = thread();
    await sayAutomationStudioResultCheck({ thread: posted, found: found({ status: "unverified" }) });
    expect(posted.said).toEqual([]);
    expect(posted.asked).toHaveLength(1);
    expect(posted.asked[0]).toMatchObject({
      ask: { askId: "result-check:run.catalogue.1", kind: "choice", parks: false, options: [{ id: "answered" }, { id: "did_not_answer" }] },
      attachment: { kind: "dataset", ref: "dataset.listings" }
    });
    expect(automationStudioResultCheckAskId("run.catalogue.1")).toBe("result-check:run.catalogue.1");
  });

  it("says nothing at all about a check the result passed", async () => {
    const posted = thread();
    await sayAutomationStudioResultCheck({ thread: posted, found: found({ status: "confirmed" }) });
    await sayAutomationStudioResultCheck({ thread: posted, found: found({ status: "no_result" }) });
    expect(posted.said).toEqual([]);
    expect(posted.asked).toEqual([]);
  });

  it("says nothing about a run the schedule passed over, whatever its status reads", async () => {
    const posted = thread();
    for (const status of ["refuted", "unverified", "confirmed"] as const) {
      await sayAutomationStudioResultCheck({ thread: posted, found: found({ status, checked: false }) });
    }
    expect(posted.said).toEqual([]);
    expect(posted.asked).toEqual([]);
  });

  it("posts without an attachment when the run stored no record set to point at", () => {
    const turn = automationStudioResultCheckTurn({ ...found(), datasetId: undefined });
    expect(turn?.attachment).toBeNull();
  });

  it("never carries the model's prose, only what Core composed", () => {
    const turn = automationStudioResultCheckTurn(found());
    expect(turn?.text).toBe(`${found().reason} ${found().observation}`);
  });
});
