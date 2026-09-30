// A provider-free replay of the amendment stall every hard live build shared.
//
// **What was recorded.** Across the six hard-site builds of 2026-09-28
// (lane t172, both rounds), the commonest decision that changed nothing was an
// `amend_draft` whose every amendment was refused -- and then the same
// amendment again, word for word:
//
//   - bigbox round 2, #7-#12: four refused presses dropped, then one step
//     "kept" three times over, `draft_unchanged` each time;
//   - everything-store round 2, #16-#19: five of five refused, identical
//     targets, four decisions in a row;
//   - crossborder round 1, #12-#15: one step dropped, kept, dropped, the kept
//     count going 4, 5, 4, 4 -- every one of them `draft_amended`, so the
//     no-progress guard never saw it at all;
//   - classifieds #13-#14 and job board #19-#20: the same refusal twice.
//
// The bundles keep codes and step ids, not the amendments' words, so this
// replay scripts the three shapes those codes admit and pins what Core shows
// and counts for each. The decisions are the recorded ones in kind and order;
// the page is a fake that succeeds or refuses on cue.
//
// **The three causes this pins.**
//
//   1. A step that did not work is listed on the draft with `disposition: kept`,
//      under an instruction that said every listed step "actually ran and
//      worked". A model reading that drops it -- which "applied", so it looked
//      like progress -- or keeps it, which was refused "already_so: the step
//      already says that", a sentence that is false in the model's reading
//      (`inResult: false`) and names nothing to do instead.
//   2. `keep` about a step already in the Flow is a confirmation, and it was
//      refused with the same generic sentence, so the model confirmed again.
//   3. An amendment that puts the draft back exactly as an earlier one found it
//      "applied", so a step toggled forever was invisible to the guard.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID } from "../../draft-amendment-feedback.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, AutomationStudioLlmUnusableDecisionError } from "../../unusable-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID } from "../index.ts";

const library = [{ toolId: "run_node", description: "Run one node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true as const }];

type Evidence = ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;

/** Presses that work unless their target says `refuse`, declared as Flow steps the way the web domain declares them. */
const page = vi.fn(async ({ value }: { value: JsonObject }) => {
  const refused = value.target === "refuse";
  return {
    kind: "llm_evidence_tool_execution" as const,
    evidence: refused ? { ok: false, code: "target_unobserved" } : { ok: true, pressed: value.target as string },
    effectApplied: !refused,
    resultCode: refused ? "web.action.rejected.target_unobserved" : "web.action.succeeded",
    draft: { actionId: "dom-click", effect: "mutate" as const, proposes: true, input: value }
  };
});

/** Runs the scripted decisions, then completes, and hands back what each decision was shown. */
async function replay(decisions: readonly JsonObject[]) {
  const shown: Evidence[] = [];
  let at = 0;
  const decide = vi.fn(async ({ evidence }: { evidence: Evidence }) => {
    shown.push(evidence);
    const next = decisions[at];
    at += 1;
    return next ?? { kind: "complete", result: { summary: "done" } };
  });
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools: library,
    decide,
    executeTool: page,
    maxIterations: 20,
    maxToolCalls: 20,
    dryRun: false,
    // The recorded build's draft was a transcript: every step that ran was kept unless withdrawn.
    draftAuthoring: "transcript",
    unusableDecisions: { stalled: () => new Error("stalled") }
  });
  return { result, shown };
}

const press = (id: string, target: string) => ({ kind: "tool_call", callId: id, toolId: "run_node", input: { target } });
const amend = (...amendments: JsonObject[]) => ({ kind: "amend_draft", amendments });

/** The amendment check the model read before decision `n` (1-based), if it was shown one after decision `n - 1`. */
function amendmentCheck(shown: Evidence[], n: number): JsonObject | undefined {
  const entries = (shown[n - 1] ?? []).filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID);
  const newest = entries.at(-1);
  return newest && newest.callId.endsWith(`.${n - 1}`) ? newest.value as JsonObject : undefined;
}

function draftRows(evidence: Evidence): JsonObject[] {
  const draft = evidence.find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: JsonObject[] } | undefined;
  return draft?.steps ?? [];
}

const opening = [press("c1", "consent"), press("c2", "refuse"), press("c3", "store")];

describe("replaying the recorded amendment stall", () => {
  it("shows a step that did not work as out of the Flow, never as a kept step to drop or confirm", async () => {
    const { shown } = await replay([...opening]);
    const rows = draftRows(shown[3]!);
    const refused = rows.find((row) => row.step === 2)!;
    expect(refused).toMatchObject({ inResult: false, changed: "no" });
    expect(refused.disposition).toBe("did_not_work");
    const instruction = (shown[3]!.find((entry) => entry.toolId === "core.flow_draft")!.value as JsonObject).instruction as string;
    expect(instruction).not.toMatch(/every step here is something you actually ran and that worked/);
    expect(instruction).toMatch(/did_not_work/);
  });

  it("refuses an edit about a step that did not work and names rerun as the way to change it", async () => {
    // bigbox round 2 #7: the refused presses dropped, the one that worked kept.
    const { result, shown } = await replay([...opening, amend({ step: 2, change: "drop" }, { step: 1, change: "keep" }, { step: 3, change: "keep" })]);
    const check = amendmentCheck(shown, 5)!;
    expect(check.refused).toEqual([
      { step: 2, reason: "did_not_work" },
      { step: 1, reason: "already_in_flow" },
      { step: 3, reason: "already_in_flow" }
    ]);
    const reasons = check.reasons as Record<string, string>;
    expect(reasons.did_not_work).toMatch(/rerun/);
    expect(reasons.already_in_flow).toMatch(/inResult/);
    // Nothing about the Flow changed, so nothing about the draft did.
    expect(result.trace.find((row) => row.decision === "amend_draft")).toMatchObject({ resultCode: "llm_evidence_loop.draft_unchanged", amended: 0 });
  });

  it("says so when an amendment is refused for the same reason it was refused for before", async () => {
    // everything-store round 2 #16-#19: the same refused amendment, four decisions in a row.
    const same = amend({ step: 2, change: "keep" }, { step: 3, change: "keep" });
    const { shown } = await replay([...opening, same, same, same]);
    const first = amendmentCheck(shown, 5)!;
    const again = amendmentCheck(shown, 6)!;
    expect((first.refused as JsonObject[]).some((refusal) => refusal.repeated)).toBe(false);
    expect(again.refused).toEqual([
      { step: 2, reason: "did_not_work", repeated: true },
      { step: 3, reason: "already_in_flow", repeated: true }
    ]);
    expect(again.instruction).toMatch(/refused for the same reason before/);
  });

  it("counts a toggle that puts the draft back as it stood as no progress, and redirects on it", async () => {
    // crossborder round 1 #12-#15: one step dropped, kept, dropped, kept.
    const { result, shown } = await replay([
      ...opening,
      amend({ step: 3, change: "drop" }),
      amend({ step: 3, change: "keep" }),
      amend({ step: 3, change: "drop" }),
      amend({ step: 3, change: "keep" })
    ]);
    const undone = amendmentCheck(shown, 6)!;
    expect(undone).toMatchObject({ code: "llm_evidence_loop.draft_amendment_undone", sameDraftAsIteration: 4 });
    // The third toggle is the third step without progress, which is where the
    // loop starts telling the model plainly it is going nowhere.
    const redirected = shown[7]!.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID);
    expect(redirected).toHaveLength(1);
    expect(result.trace.filter((row) => row.decision === "amend_draft").map((row) => row.resultCode)).toEqual([
      "llm_evidence_loop.draft_amended",
      "llm_evidence_loop.draft_amendment_undone",
      "llm_evidence_loop.draft_amendment_undone",
      "llm_evidence_loop.draft_amendment_undone"
    ]);
  });

  it("shows an unusable reply every kind of decision it was offered, amend_draft included", async () => {
    // Every lane-t172 build had one to three `invalid_evidence_decision` replies
    // (crossborder #32-#34 three in a row), each followed by an accepted-shape
    // picture that listed tool_call and complete and not amend_draft.
    const shown: Evidence[] = [];
    const script = [...opening];
    let at = 0;
    const decide = vi.fn(async ({ evidence }: { evidence: Evidence }) => {
      shown.push(evidence);
      at += 1;
      if (at === 4) throw new AutomationStudioLlmUnusableDecisionError(["llm_output.invalid_evidence_decision"]);
      return script[at - 1] ?? { kind: "complete", result: { summary: "done" } };
    });
    await runAutomationStudioLlmEvidenceLoop({ tools: library, decide, executeTool: page, maxIterations: 20, maxToolCalls: 20, dryRun: false, draftAuthoring: "transcript", unusableDecisions: { stalled: () => new Error("stalled") } });
    const check = shown[4]!.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID)!.value as { accepted: { oneOf: JsonObject[] } };
    expect(check.accepted.oneOf.map((shape) => shape.kind)).toEqual(["tool_call", "complete", "amend_draft"]);
  });

  it("does not call an edit undone when something was run between, since the draft is then a new one", async () => {
    const { result } = await replay([
      ...opening,
      amend({ step: 3, change: "drop" }),
      press("c4", "search"),
      amend({ step: 3, change: "keep" })
    ]);
    expect(result.trace.filter((row) => row.decision === "amend_draft").map((row) => row.resultCode)).toEqual([
      "llm_evidence_loop.draft_amended",
      "llm_evidence_loop.draft_amended"
    ]);
  });

  it("still treats a first drop of a step that worked as an edit, and completes on the draft it leaves", async () => {
    const { result } = await replay([...opening, amend({ step: 1, change: "drop" })]);
    expect(result.ok).toBe(true);
    expect(result.trace.find((row) => row.decision === "amend_draft")).toMatchObject({ resultCode: "llm_evidence_loop.draft_amended", amended: 1 });
    expect(result.steps.filter((step) => step.disposition === "kept" && step.effectApplied).map((step) => step.position)).toEqual([3]);
  });
});
