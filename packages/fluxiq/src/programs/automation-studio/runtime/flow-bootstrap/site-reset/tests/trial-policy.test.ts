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
    expect(answer).toEqual({ kind: "admit", moved: false });
    expect(asked).toBe(false);
  });

  it("is due while an act is still in place, though nothing new was recorded", async () => {
    const answer = await policy({ ...due, recorded: 0 }, [act], { moved: true, differs: ["a"] });
    expect(answer).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [act] } });
  });

  // Lane D round 9 (`run-mv5q4j2n-25784472`, t471): a start page that shows nothing of an act never vouches for it.
  it("refuses while an act is still to undo though the start page is as the build found it", async () => {
    expect(await policy(due, [act], { moved: true, differs: [] })).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [act] } });
  });

  it("admits when nothing is left to undo and the start is back", async () => {
    expect(await policy(due, [], { moved: true, differs: [] })).toEqual({ kind: "admit", moved: true });
  });

  it("refuses while acts are in place, naming them and what differs, in generic words", async () => {
    const answer = await policy(due, [act], { moved: true, differs: ["one line more than at the start"] });
    expect(answer).toMatchObject({ kind: "refuse", moved: true, startDiffers: false, evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: [act], differs: ["one line more than at the start"] } });
    if (answer.kind !== "refuse") return;
    const instruction = String(answer.evidence.instruction);
    expect(instruction).toContain("\"undoes\": \"<act>\"");
    expect(instruction).toContain("Removing only what the act created needs no permission");
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
    expect(await policy(due, [], { moved: false })).toEqual({ kind: "admit", moved: false });
  });

  it("refuses a start that still differs once per phase, then admits saying what differed", async () => {
    const first = await policy(due, [], { moved: true, differs: ["a"] });
    expect(first).toMatchObject({ kind: "refuse", startDiffers: true, evidence: { code: "candidate.trial_start_differs", differs: ["a"] } });
    const second = await policy({ ...due, refusals: 1, startDiffersSent: true, lastRefusal: "other" }, [], { moved: true, differs: ["b"] });
    expect(second).toMatchObject({ kind: "admit", startedWith: { differs: ["b"] }, moved: true });
  });

  // F1 continuation, after F3's note: a whole trial ran on two acts a blocked reset never undid. Only an act named as
  // one the site cannot undo (kept) may stay; an act still to undo refuses every trial, however often it is asked.
  it("never admits a trial on an act still to undo: not for a refusal identical to the last, nor past three in a phase", async () => {
    const first = await policy(due, [act], { moved: true, differs: ["a"] });
    expect(first.kind).toBe("refuse");
    if (first.kind !== "refuse") return;
    expect(await policy({ ...due, refusals: 1, lastRefusal: first.signature }, [act], { moved: false, differs: ["a"] })).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [act] } });
    expect(await policy({ ...due, refusals: 3, lastRefusal: "older" }, [act], { moved: true, differs: ["c"] })).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [act] } });
    expect(await policy({ ...due, refusals: 9, lastRefusal: first.signature, startDiffersSent: true }, [act], { moved: false })).toMatchObject({ kind: "refuse" });
  });

  it("still never deadlocks on a start that only differs: with no act to undo, a repeated difference admits saying what differed", async () => {
    const first = await policy(due, [], { moved: true, differs: ["c"] });
    expect(first.kind).toBe("refuse");
    if (first.kind !== "refuse") return;
    const capped = await policy({ ...due, refusals: 3, lastRefusal: "older" }, [], { moved: true, differs: ["c"] });
    expect(capped).toMatchObject({ kind: "admit", startedWith: { differs: ["c"] }, moved: true });
    if (capped.kind === "admit") expect(String(capped.startedWith?.instruction)).toContain("already in place when it began");
  });

  it("names what of each act is still there, and lets the model say an act cannot be undone", async () => {
    const still = { ...act, stillThere: ["new: \"Done\""] };
    const answer = await policy(due, [still], { moved: true, differs: [] });
    expect(answer).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [still] } });
    if (answer.kind === "refuse") {
      expect(String(answer.evidence.instruction)).toContain("stillThere");
      expect(String(answer.evidence.instruction)).toContain("cannotUndo");
    }
  });

  it("runs a trial with kept acts in place, saying so, without comparing when nothing else is due", async () => {
    let asked = false;
    const kept = [{ act: "act-2", did: "press \"Confirm\" button" }];
    const compare = async (): Promise<AutomationStudioSiteResetComparison> => {
      asked = true;
      return { moved: true, differs: [] };
    };
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...due, recorded: 0 }, inPlace: [], kept, compare });
    expect(answer).toMatchObject({ kind: "admit", moved: false, startedWith: { cannotUndo: kept } });
    expect(asked).toBe(false);
    if (answer.kind === "admit") {
      const said = String(answer.startedWith?.instruction);
      expect(said).toContain("could not be undone on this site");
      expect(said).toContain("passes over an item that is already done");
      expect(said).not.toMatch(/(cart|friend|request|confirm|store|shop)/iu);
    }
  });

  it("runs with kept acts though the start differs, presuming the difference theirs, and still asks for an act to undo", async () => {
    const kept = [{ act: "act-2", did: "press \"Confirm\" button" }];
    expect(await automationStudioSiteResetTrialPolicy({ phase: due, inPlace: [], kept, compare: comparing({ moved: true, differs: ["new: x"] }) }))
      .toMatchObject({ kind: "admit", startedWith: { cannotUndo: kept, differs: ["new: x"] } });
    expect(await automationStudioSiteResetTrialPolicy({ phase: due, inPlace: [act], kept, compare: comparing({ moved: true, differs: [] }) }))
      .toMatchObject({ kind: "refuse", evidence: { actsToUndo: [act], cannotUndo: kept } });
  });
});
