import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetReach,
  automationStudioSiteResetSettleDecision as decide,
  automationStudioSiteResetSettleWords as settleWords,
  type AutomationStudioSiteResetJudgedGroup
} from "../index.ts";

// t743, photo `run-mvgw7320-de416190`: a list Core's own look cannot read
// again is lost for the build (`../reach.ts`) and never a `look` again
// (`../decision.ts`). Pure parts alone; the ledger's use of them is in
// `../../site-reset/tests/settlement-unreachable.test.ts`.

const group = (status: AutomationStudioSiteResetJudgedGroup["status"], extra: Partial<AutomationStudioSiteResetJudgedGroup> = {}): AutomationStudioSiteResetJudgedGroup => ({ status, scopes: ["p:list"], changed: false, ref: "destination-1", location: "loc:view", group: "g:list", ...extra });

describe("the build's lost lists", () => {
  it("remembers a lost group for good, and never an absent one", () => {
    const reach = new AutomationStudioSiteResetReach();
    expect(reach.unreachable("g:list")).toBe(false);
    reach.lost("g:list");
    expect([reach.unreachable("g:list"), reach.unreachable("g:other"), reach.unreachable(undefined)]).toEqual([true, false, false]);
  });
});

describe("the settle decision with a lost list", () => {
  it("never asks to look at a lost list: with another witness holding it settles, saying which list was not read again", () => {
    for (const status of ["stale", "incomplete"] as const) {
      expect(decide({ groups: [group(status, { unreachable: true })], toggle: { status: "holds", location: "loc:card" }, changeSeen: true, undoLanded: true })).toEqual({ kind: "settled", how: "restored", unread: ["destination-1"] });
      expect(decide({ groups: [group(status, { unreachable: true }), group("holds", { ref: "destination-2", group: "g:other" })], changeSeen: false, undoLanded: false })).toEqual({ kind: "settled", how: "unchanged", unread: ["destination-1"] });
    }
  });

  it("leaves the other witnesses' reasons open, with no look for the lost list", () => {
    expect(decide({ groups: [group("stale", { unreachable: true })], toggle: { status: "open", location: "loc:card" }, changeSeen: true, undoLanded: false })).toEqual({ kind: "open", reasons: [{ reason: "toggle", witness: "toggle", location: "loc:card" }] });
  });

  it("as the only witness it is open with `unreachable`, which its words say no call can settle", () => {
    const decision = decide({ groups: [group("stale", { unreachable: true })], changeSeen: false, undoLanded: false });
    expect(decision).toEqual({ kind: "open", reasons: [{ reason: "unreachable", witness: "group", ref: "destination-1", location: "loc:view", group: "g:list" }] });
    const words = decision.kind === "open" ? settleWords(decision.reasons, []) : "";
    expect(words).toBe("Destination-1 at loc:view could not be read again, and nothing else shows this act put back: no call can settle it in this build.");
  });

  it("judges a lost list read fresh as any list: holding settles, differing asks to undo", () => {
    expect(decide({ groups: [group("holds", { unreachable: true })], changeSeen: false, undoLanded: false })).toEqual({ kind: "settled", how: "unchanged" });
    expect(decide({ groups: [group("differs", { unreachable: true })], changeSeen: true, undoLanded: false })).toMatchObject({ kind: "open", reasons: [{ reason: "undo" }] });
  });

  it("drops a lost adopted list: with nothing else adopted the act is to name one; an adopted reason is marked", () => {
    expect(decide({ groups: [], changeSeen: false, undoLanded: false, adopted: [group("stale", { unreachable: true })] })).toEqual({ kind: "open", reasons: [{ reason: "name" }] });
    expect(decide({ groups: [], changeSeen: false, undoLanded: false, adopted: [group("stale")] })).toEqual({ kind: "open", reasons: [{ reason: "look", witness: "group", ref: "destination-1", location: "loc:view", group: "g:list", adopted: true }] });
    expect(decide({ groups: [], changeSeen: false, undoLanded: false, adopted: [group("differs")] })).toEqual({ kind: "open", reasons: [{ reason: "name", adopted: true }] });
  });
});
