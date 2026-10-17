// An unchanged rerun of a read whose condition left out no row is told that
// condition and what it read, instead of the act after the read (t693,
// `../narrowed-nothing.ts`, through `../../draft-amendment-feedback/index.ts`).
//
// Run `run-mvbr0w7e-6a01c05b`'s result repair spent 45% of the run resending one
// condition that every row met, six identical decisions, each told to inspect
// the result and, if its rows were right, go on to the act after the read. The
// host now states what each condition kept on its own call, Core carries it onto
// the draft step, and the refusal names the condition. The telling is this
// directory's; the parse, the record and the loop around it are exercised here
// because they are how it reaches the model. The examples are a library
// catalogue's, not a store's.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStepCondition } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceCallRecord, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, automationStudioLlmEvidenceDraftAmendmentFeedback, runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceNarrowedNothing } from "../index.ts";

describe("the condition an unchanged read rerun narrowed nothing with", () => {
  it("names the condition that kept every row, how many, and the values it read on them", () => {
    const said = automationStudioLlmEvidenceNarrowedNothing({ position: 4, conditions: [
      { kept: 9, rejected: 3, keptValues: ["1998"] },
      { kept: 12, rejected: 0, keptValues: ["On loan", "Available"] }
    ] })!;
    expect(said).toContain("Step 4's identical request was not sent again");
    expect(said).toContain(`Condition 2 left out none of the 12 rows it was asked about: it held of every one, and the values it read on them include "On loan", "Available".`);
    expect(said).toContain("as written that condition narrows nothing");
    expect(said).toContain(`{"step": 4, "change": "rerun", "input": {<only the keys that change>}}`);
    expect(said).toContain("If every row step 4 kept is one the instruction asks for, that condition is not needed");
    // The condition that did leave rows out is not named.
    expect(said).not.toContain("Condition 1");
  });

  it("says when the condition read no value on any kept row, and speaks of several in the plural", () => {
    const said = automationStudioLlmEvidenceNarrowedNothing({ position: 2, conditions: [
      { kept: 1, rejected: 0, keptValues: [] },
      { kept: 5, rejected: 0, keptValues: ["Hardcover"] }
    ] })!;
    expect(said).toContain("Condition 1 left out none of the 1 row it was asked about: it held of every one, and it read no value on any of them.");
    expect(said).toContain(`Condition 2 left out none of the 5 rows`);
    expect(said).toContain("as written those conditions narrow nothing");
    expect(said).toContain("those conditions are not needed");
  });

  it("says nothing when every condition left rows out, none was asked about any row, or the step has no account", () => {
    expect(automationStudioLlmEvidenceNarrowedNothing({ position: 3, conditions: [{ kept: 4, rejected: 8, keptValues: ["Available"] }] })).toBeUndefined();
    expect(automationStudioLlmEvidenceNarrowedNothing({ position: 3, conditions: [{ kept: 0, rejected: 0, keptValues: [] }] })).toBeUndefined();
    expect(automationStudioLlmEvidenceNarrowedNothing({ position: 3 })).toBeUndefined();
  });
});

const list = { toolId: "list", description: "List rows.", inputSchema: { type: "object" }, effect: "observe" as const };
const renew = { toolId: "renew", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const idle: AutomationStudioFlowDraftStepCondition[] = [{ kept: 12, rejected: 0, keptValues: ["On loan", "Available"] }];
const shown = { ok: true, rows: [{ title: "The Long Shore", status: "On loan" }, { title: "Tidewater", status: "Available" }] };
const read = (conditions: AutomationStudioFlowDraftStepCondition[], effect: "observe" | "mutate" = "observe"): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence: shown, effectApplied: true, stateDigests: { before: "catalogue", after: "catalogue" },
  draft: { actionId: "web.extract.list", proposes: true, effect, conditions }
});
const nextOf = (feedback: Record<string, unknown>): string => String((feedback.refused as { next?: string }[])[0]?.next);

describe("an unchanged rerun of a read whose condition left out no row", () => {
  const steps = [
    { position: 1, effect: "mutate", effectApplied: true, disposition: "kept" },
    { position: 2, effect: "observe", effectApplied: true, disposition: "kept", conditions: idle },
    { position: 3, effect: "mutate", effectApplied: true, disposition: "kept" }
  ];
  const told = (stepsNow: typeof steps) => automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: [{ step: 2, reason: "changes_nothing", repeated: true }], applied: 0, steps: stepsNow, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });

  it("is told that condition and what it read, not the act after the read", () => {
    const next = nextOf(told(steps));
    expect(next).toContain(`Condition 1 left out none of the 12 rows it was asked about: it held of every one, and the values it read on them include "On loan", "Available".`);
    expect(next).toContain("as written that condition narrows nothing");
    expect(next).not.toContain("Step 3 is the first step after step 2");
    expect(next).not.toContain(`"change": "repeat"`);
  });

  it("leaves the telling of a read with no such condition as it was", () => {
    const narrowing = steps.map((step) => step.position === 2 ? { ...step, conditions: [{ kept: 4, rejected: 8, keptValues: ["Available"] }] } : step);
    expect(nextOf(told(narrowing))).toContain("Step 3 is the first step after step 2");
    const unsaid = steps.map((step) => step.position === 2 ? { position: 2, effect: "observe", effectApplied: true, disposition: "kept" } : step);
    expect(nextOf(told(unsaid))).toContain("Step 3 is the first step after step 2");
  });

  it("arrives from the call's statement onto its record, only on a read, with values its evidence showed", () => {
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(read(idle), "observe")!;
    expect(parsed.draft?.conditions).toEqual(idle);
    expect(automationStudioLlmEvidenceCallRecord(list, {}, parsed).conditions).toEqual(idle);
    expect(automationStudioLlmEvidenceParseToolExecutionResult(read(idle, "mutate"), "mutate")?.draft).not.toHaveProperty("conditions");
    const unshown = automationStudioLlmEvidenceParseToolExecutionResult(read([{ kept: 12, rejected: 0, keptValues: ["Withdrawn"] }]), "observe")!;
    expect(unshown.draft?.conditions).toEqual([{ kept: 12, rejected: 0, keptValues: [] }]);
  });

  it("reaches the model from the loop when the identical rerun is refused", async () => {
    const executeTool = vi.fn(async () => read(idle));
    const where = { where: [{ field: "status", present: true }] };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.list", toolId: "list", input: where, add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: where }] })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "..." } });
    await runAutomationStudioLlmEvidenceLoop({ tools: [list, renew], decide, executeTool, maxIterations: 6, maxToolCalls: 6, unusableDecisions: { stalled: () => new Error("stalled") }, dryRun: false });
    const evidence = decide.mock.calls[2]?.[0].evidence as { toolId: string; value: Record<string, unknown> }[];
    const feedback = evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID)?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "changes_nothing" }] });
    expect(nextOf(feedback!)).toContain("Condition 1 left out none of the 12 rows");
    expect(nextOf(feedback!)).toContain(`"On loan", "Available"`);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});
