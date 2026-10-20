import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetRead } from "../../../flow-bootstrap/site-reset/index.ts";
import { automationStudioProjectDispatchResetDone } from "../reset-done.ts";

// t684, t679 open question 3: a reset came back done saying "Every lasting act
// this build made is undone" while its undo of one was refused and the act
// stayed on the site. L1 reset settlement: why an act stayed is read off its
// ledger's `standing`, an act settled unchanged said as such.

function pressed(callId: string, name: string, consequences: AutomationStudioActionConsequence[], item?: string): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", ...(item ? { item } : {}) }, verb: "press" } };
}
const ALL_UNDONE = "Every lasting act this build made is undone; the site is as the build found it.";

describe("a reset's done", () => {
  it("says every act is undone only when none stayed: one undone, one only possibly lasting", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    brief.explored(pressed("save", "Save", ["create_new"], "card:soup"));
    brief.explored(pressed("coupon", "Apply coupon", []));
    expect(brief.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: { item: "card:soup" } })).toMatchObject({ kind: "admit" });
    brief.explored({ callId: "unsave", toolId: "core.run_node", landed: true, undoes: "act-1", on: "own", declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Unsave", kind: "button", item: "card:soup" }, verb: "press" } });
    expect(automationStudioProjectDispatchResetDone(ledger)).toBe(ALL_UNDONE);
  });

  it("names an act whose undo was refused as aimed at another item, and one no control takes back, and never says every act is undone", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const one = ledger.forBrief("brief-1");
    one.explored(pressed("save", "Save", ["create_new"], "card:soup"));
    // The undo aimed at another card is refused, and the act is kept.
    expect(one.target("act-1", { effect: "mutate", consequences: ["modify_existing"], control: { item: "card:bread" } })).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_wrong_target" } });
    ledger.forBrief("brief-2").explored(pressed("pay", "Pay", ["move_money"]));
    const done = automationStudioProjectDispatchResetDone(ledger);
    expect(done).not.toContain("Every lasting act this build made is undone");
    expect(done).toBe("This reset undid every act of this build it could, but 2 lasting acts of this build stay on the site, so the site is not as the build found it: clicked “Save” (the site offers no way to undo it), clicked “Pay” (FluxIQ cannot undo it).");
  });

  // t738, everything-store `run-mvgf04kw-310fc169`: acts settled unchanged were listed by id as leaving the site "not as the build found it".
  it("says of an act settled unchanged that it may not have changed anything, never that it stays on the site (L1, t738)", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const brief = ledger.forBrief("brief-1");
    const list = (subjects: string[]) => ({ scope: "p:items", group: "g:items", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
    const read: AutomationStudioSiteResetRead = { state: {}, differs: [], resource: "r:site", scope: "p:list-page", location: "loc:list", collections: [list(["s:one", "s:two"])] };
    ledger.observed(read);
    brief.observed(read);
    // The model is shown the list's ref, as the routing shows it beside a read.
    expect(brief.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    const control = { name: "Start a draft", kind: "button" as const, subject: "s:three", page: "s:three", resource: "r:site" };
    expect(brief.createBaseline({ effect: "mutate", consequences: ["create_new"], control }, "destination-1")).toEqual({ kind: "admit" });
    brief.explored({ callId: "draft", toolId: "core.run_node", landed: true, resetDestination: "destination-1", declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control, verb: "press" } });
    // Core's own look finds the list as the build found it.
    expect(await brief.beforeTrial({ compare: async () => ({ moved: false, differs: [] }), lookAt: async () => brief.observed(read) })).toMatchObject({ kind: "admit" });
    expect(brief.standing("act-1")).toBe("unchanged");
    const done = automationStudioProjectDispatchResetDone(ledger);
    expect(done).toBe("Every act of this build that showed a change is undone. 1 act of this build showed no change on the site, so it may not have changed anything: clicked “Start a draft”.");
    expect(done).not.toContain("not as the build found it");
    expect(done).not.toMatch(/act-\d/u);
  });

  it("names ten acts that stayed and counts the rest", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    for (let n = 1; n <= 12; n += 1) ledger.forBrief("brief-1").explored(pressed(`pay.${n}`, `Pay ${n}`, ["move_money"]));
    const done = automationStudioProjectDispatchResetDone(ledger);
    expect(done).toContain("12 lasting acts of this build stay on the site");
    expect(done).toContain("clicked “Pay 10” (FluxIQ cannot undo it)");
    expect(done).not.toContain("“Pay 11”");
    expect(done).not.toMatch(/act-\d/u);
    expect(done.endsWith(", and 2 more.")).toBe(true);
  });
});
