import { describe, expect, it } from "vitest";
import { automationStudioSiteResetTrialPolicy } from "../index.ts";

// What a trial starts with, alone (t775): this build's acts on the site never
// refuse a trial; they are said under startedWith, in generic words.

const act = { act: "act-1", did: "press \"Save\" button", settle: "read destination-1 again" };
const kept = { act: "act-2", did: "press \"Join\" button" };
const unsettleable = { act: "act-3", did: "press \"Like\" button", reason: "gate_unsatisfiable" as const, failed: "witness_unreachable" as const };

describe("site reset trial policy (t775)", () => {
  it("admits with nothing said when nothing of the build is on the site and the start does not differ", () => {
    expect(automationStudioSiteResetTrialPolicy({ inPlace: [] })).toEqual({ kind: "admit" });
  });

  it("admits a trial with acts still in place, listing them under startedWith.acts, never their settle words", () => {
    const answer = automationStudioSiteResetTrialPolicy({ inPlace: [act], differs: ["a line"] });
    expect(answer).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1", did: act.did }], differs: ["a line"] } });
    expect(JSON.stringify(answer)).not.toContain("settle");
  });

  it("admits a trial with acts no call can settle, listed with what they failed, and kept acts under cannotUndo", () => {
    const answer = automationStudioSiteResetTrialPolicy({ inPlace: [], kept: [kept], unsettleable: [unsettleable] });
    expect(answer).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-3", failed: "witness_unreachable" }], cannotUndo: [kept] } });
  });

  it("says the trial is judged by what it changed from that start, and never asks for an undo", () => {
    const said = String(automationStudioSiteResetTrialPolicy({ inPlace: [act] }).startedWith?.instruction);
    expect(said).toContain("judges the trial by what changed from the state just before it");
    expect(said).not.toMatch(/undo each|put the site back|test the same revision again/iu);
    expect(said).not.toMatch(/\b(cart|basket|like|save|job|checkout|store)\b/iu);
  });
});
