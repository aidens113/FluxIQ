import { describe, expect, it } from "vitest";
import { automationStudioSiteResetTrialPolicy, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetPhase } from "../index.ts";

// The policy before one trial, alone: when it compares, when it refuses, and
// that it never deadlocks.

const act = { act: "act-1", did: "press \"Save\" button" };
const due: AutomationStudioSiteResetPhase = { recorded: 1, refusals: 0, startDiffersSent: false };
const comparing = (result: AutomationStudioSiteResetComparison) => async () => result;
const policy = (phase: AutomationStudioSiteResetPhase, inPlace: typeof act[], comparison: AutomationStudioSiteResetComparison) =>
  automationStudioSiteResetTrialPolicy({ phase, inPlace, compare: comparing(comparison) });

describe("site reset trial policy", () => {
  it("admits without comparing when nothing was recorded since the build began or the last trial and nothing is in place", async () => {
    let asked = false;
    const compare = async (): Promise<AutomationStudioSiteResetComparison> => {
      asked = true;
      return { moved: true, differs: ["x"] };
    };
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...due, recorded: 0 }, inPlace: [], compare });
    expect(answer).toEqual({ kind: "admit", allUndone: false, moved: false });
    expect(asked).toBe(false);
  });

  it("is due while an act is still in place, though nothing new was recorded", async () => {
    const answer = await policy({ ...due, recorded: 0 }, [act], { moved: true, differs: ["a"] });
    expect(answer).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [act] } });
  });

  it("admits and marks everything undone when the site is back", async () => {
    expect(await policy(due, [act], { moved: true, differs: [] })).toEqual({ kind: "admit", allUndone: true, moved: true });
  });

  it("refuses while acts are in place, naming them and what differs, in generic words", async () => {
    const answer = await policy(due, [act], { moved: true, differs: ["one line more than at the start"] });
    expect(answer).toMatchObject({ kind: "refuse", moved: true, startDiffers: false, evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: [act], differs: ["one line more than at the start"] } });
    if (answer.kind !== "refuse") return;
    const instruction = String(answer.evidence.instruction);
    expect(instruction).toContain("\"undoes\": \"<act>\"");
    expect(instruction).toContain("needs no permission and is not a repeat");
    expect(instruction).toContain("Do not change anything that was there before the build began");
    expect(instruction).toContain("test the same revision again");
    expect(instruction).not.toMatch(/\b(cart|product|basket|checkout|store|shop)\b/iu);
  });

  it("refuses on the ledger alone when the start cannot be compared", async () => {
    const answer = await policy(due, [act], { moved: false });
    expect(answer).toMatchObject({ kind: "refuse", moved: false, evidence: { code: "candidate.trial_reset_required", actsToUndo: [act] } });
    expect(answer.kind === "refuse" && "differs" in answer.evidence).toBe(false);
  });

  it("admits with nothing in place and nothing known to differ", async () => {
    expect(await policy(due, [], { moved: false })).toEqual({ kind: "admit", allUndone: false, moved: false });
  });

  it("refuses a start that still differs once per phase, then admits saying what differed", async () => {
    const first = await policy(due, [], { moved: true, differs: ["a"] });
    expect(first).toMatchObject({ kind: "refuse", startDiffers: true, evidence: { code: "candidate.trial_start_differs", differs: ["a"] } });
    const second = await policy({ ...due, refusals: 1, startDiffersSent: true, lastRefusal: "other" }, [], { moved: true, differs: ["b"] });
    expect(second).toEqual({ kind: "admit", allUndone: false, startedWith: { differs: ["b"] }, moved: true });
  });

  it("never deadlocks: the same acts and differences as the last refusal admit the trial", async () => {
    const first = await policy(due, [act], { moved: true, differs: ["a"] });
    expect(first.kind).toBe("refuse");
    if (first.kind !== "refuse") return;
    const again = await policy({ ...due, refusals: 1, lastRefusal: first.signature }, [act], { moved: false, differs: ["a"] });
    expect(again).toEqual({ kind: "admit", allUndone: false, startedWith: { acts: [act], differs: ["a"] }, moved: false });
  });

  it("never deadlocks: past three refusals in one phase the trial runs", async () => {
    const progress = await policy({ ...due, refusals: 2, lastRefusal: "older" }, [act], { moved: true, differs: ["a"] });
    expect(progress.kind).toBe("refuse");
    const capped = await policy({ ...due, refusals: 3, lastRefusal: "older" }, [act], { moved: true, differs: ["c"] });
    expect(capped).toEqual({ kind: "admit", allUndone: false, startedWith: { acts: [act], differs: ["c"] }, moved: true });
  });
});
