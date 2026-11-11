// What a round is told after a saved Flow's run failed on a step (t870): running a saved step that
// acts lastingly again only checks it (`runtime/llm/node-tools/rerun-check.ts`), so "fix that step"
// alone sends a model down a rerun that does nothing.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstRoundNote } from "../round-note.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../state.ts";

const runThatFailed = (failing: { position: number; happened: string } | undefined) => ({
  route: { kind: "run", notes: [] },
  flowRun: { outcome: { kind: "ran", steps: [{ position: 1, ran: true }], ...(failing ? { failing } : {}) } },
  record: new AutomationStudioAttemptActRecord(),
  tried: { data: () => ({ tried: [], approaches: 0 }) },
  sink: { summary: () => ({ totalRows: 0, columns: [] }) },
  completion: { state: {} }
}) as unknown as AutomationStudioAnswerFirstAttemptRun;

describe("the note on a failed saved step", () => {
  const happened = (run: AutomationStudioAnswerFirstAttemptRun) => (automationStudioAnswerFirstRoundNote(run, undefined)?.flowRun as { happened: string }).happened;

  it("says what happened first, and then how a changed step gets run", () => {
    const said = happened(runThatFailed({ position: 3, happened: "That step's control was not found." }));
    expect(said.startsWith("That step's control was not found. The page is where it left it.")).toBe(true);
    expect(said).toMatch(/only checks it when it acts lastingly, and does nothing/u);
    expect(said).toMatch(/write the changed step as a new step, drop the old one, and then run forward/u);
  });

  it("names no site, no tool and no parameter", () => {
    const said = happened(runThatFailed({ position: 3, happened: "" }));
    expect(said).not.toMatch(/core\.|run_node|amend|rerun|write:|library|loan|renew|card/iu);
  });

  it("says nothing of it where the run stopped on no step", () => {
    expect(happened(runThatFailed(undefined))).not.toMatch(/new step/u);
  });
});

describe("the note on a list that started over or got smaller", () => {
  const withRows = (rows: object) => ({ ...runThatFailed(undefined), sink: { summary: () => ({ totalRows: 3, columns: [{ id: "title", label: "Title" }], ...rows }) } }) as unknown as AutomationStudioAnswerFirstAttemptRun;
  const kept = (run: AutomationStudioAnswerFirstAttemptRun) => automationStudioAnswerFirstRoundNote(run, undefined)?.rowsKept as Record<string, unknown>;

  it("says the latest read replaced the list, and that it got smaller, in words that name no site and no task", () => {
    const told = kept(withRows({ startedOver: true, fewerThanEarlier: { earlierRows: 5 } }));
    expect(String(told.startedOver)).toMatch(/replaced what an earlier read of it held/u);
    expect(told.fewerThanEarlier).toMatchObject({ earlierRows: 5 });
    expect(JSON.stringify(told)).not.toMatch(/library|loan|renew|card|core\./iu);
  });

  it("says nothing of either while the list carried on", () => {
    expect(kept(withRows({}))).toEqual({ totalRows: 3, columns: ["title"] });
  });
});

describe("the note on saved steps that did not assemble", () => {
  const repairing = (issues?: readonly { code: string; step?: number; said?: string }[]) => ({
    ...runThatFailed(undefined), flowRun: undefined,
    route: { kind: "repair", notes: [], why: "", saved: {}, ...(issues ? { issues } : {}) }
  }) as unknown as AutomationStudioAnswerFirstAttemptRun;
  const told = (run: AutomationStudioAnswerFirstAttemptRun) => automationStudioAnswerFirstRoundNote(run, undefined)?.flowRun as Record<string, unknown>;

  it("names each refusal's code and step, with Core's sentence where the assembly let it through", () => {
    const said = "Step 7 repeats while step 7 succeeds, and step 7 has no way to say the loop is done.";
    const note = told(repairing([{ code: "flow_draft.repeat_while_never_ends", step: 7, said }, { code: "flow_draft.input_conflict", step: 2 }]));
    expect(String(note.happened)).toMatch(/could not be made into a Flow/u);
    expect(note.issues).toEqual([{ code: "flow_draft.repeat_while_never_ends", step: 7, said }, { code: "flow_draft.input_conflict", step: 2 }]);
    expect(String(note.why)).not.toMatch(/library|loan|renew|card|core\./iu);
  });

  it("says only that they did not fit where nothing was said of why", () => {
    expect(told(repairing())).toEqual({ happened: expect.stringMatching(/could not be made into a Flow/u) });
  });
});
