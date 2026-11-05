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
