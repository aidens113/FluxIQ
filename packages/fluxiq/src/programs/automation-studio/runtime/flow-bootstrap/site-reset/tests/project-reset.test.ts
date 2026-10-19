import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset, type AutomationStudioSiteResetChecks } from "../index.ts";

// F3's last note (`fix-f3-reset-brief-preflight.md`): once a reset brief came
// back blocked with two of the build's reversible acts still on the site, the
// supervisor's next whole trial ran (`start: not_reset`) and the build
// proposed. The whole trial asks the build's one reset
// (`../project-reset.ts`) with no look, and each brief's ledger answered a
// refusal identical to its last -- no progress -- by admitting the trial on
// the leftovers. The user's rule (2026-10-12): before every trial and the
// judged whole run the build's own lasting acts are undone; only an act the
// site truly cannot undo may stay, and the judge is told.

/** The supervisor's checks: it never looks at the target. */
const UNLOOKED: AutomationStudioSiteResetChecks = { compare: async () => ({ moved: false }) };

function built() {
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder-1");
  for (const n of [1, 2]) builder.explored({ callId: `add.${n}`, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: "Add", kind: "button" }, verb: "press" } });
  return { project, reset: automationStudioSiteResetProjectReset({ project, checks: () => UNLOOKED }) };
}

describe("the whole trial's reset after a reset that made no progress", () => {
  it("refuses while the build's reversible acts are still on the site, however often it is asked", async () => {
    const { project, reset } = built();
    for (let ask = 0; ask < 5; ask += 1) {
      expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    }
    expect(project.snapshot().acts.map((act) => act.inPlace)).toEqual([true, true]);
  });

  it("runs only with acts named as ones the site cannot undo, each told to the judge, and refuses for any other still there", async () => {
    const { reset } = built();
    expect(await reset.beforeTrial(undefined)).toMatchObject({ kind: "refuse" });
    expect(await reset.beforeTrial(undefined, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-2" }], cannotUndo: [{ act: "act-1" }] } });
    expect(await reset.beforeTrial(undefined, ["act-2"])).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
  });
});
