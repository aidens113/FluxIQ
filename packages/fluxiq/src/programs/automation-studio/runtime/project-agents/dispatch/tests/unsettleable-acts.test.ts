// An act no call can settle (t743, S2): the project ledger's `unsatisfiable()`
// acts leave the acts to undo, yet every trial is refused while one is on the
// site. A reset whose only acts left are such acts completes at once instead of
// looping on them, and comes back blocked naming them as left on the site; any
// return that is not done while one is there carries `gate_unsatisfiable`, read
// off the ledger (`../ending.ts`, `gateUnsatisfiable`; `../run-brief.ts`). On the
// dispatcher's garden catalogue; the acts are presses on controls no read ever
// showed, so nothing can be named for them.
import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetExplored } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowBuilderOutcome } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { automationStudioProjectBuilderReturn } from "../../contracts/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import type { AutomationStudioProjectResetPorts } from "../index.ts";
import { automationStudioProjectDispatchResetDone } from "../reset-done.ts";
import { gardenBrief, gardenBuild } from "./dispatch-fixture.ts";

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const spend = { allowance: undefined, trials: [] };

/** A press on a control in no list any read showed: with no ref ever issued, nothing can be named for it. */
function unnamed(callId: string, subject: string): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Mark", kind: "button", subject }, verb: "press" } };
}

/** `ledger` holding one act no call can settle, made by `briefId`. */
function withUnsettleable(ledger: AutomationStudioSiteResetProjectLedger, briefId = "b-build"): string {
  ledger.forBrief(briefId).explored(unnamed("mark", "s:mark"));
  const [act] = ledger.unsatisfiable();
  expect(act).toMatchObject({ act: "act-1", reason: "gate_unsatisfiable", owner: briefId });
  expect(ledger.snapshot().acts.filter((entry) => entry.inPlace)).toEqual([]);
  return act!.act;
}

function resetBrief() {
  return gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 4 }));
}

describe("a reset's done words", () => {
  it("name an act no call can settle as left on the site, and never say every act is undone", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    withUnsettleable(ledger);
    const done = automationStudioProjectDispatchResetDone(ledger);
    expect(done).toBe("This reset undid every act of this build it could. 1 act of this build can no longer be checked or put back, so it may still be on the site: clicked “Mark”.");
    expect(done).not.toContain("is undone");
  });
});

describe("a return while an act no call can settle is on the site", () => {
  it("turns a reset's done into blocked with gate_unsatisfiable, and the record keeps it", () => {
    const reset = resetBrief();
    const done = ending.reset(reset, { ok: true } as unknown as Parameters<typeof ending.reset>[1], [], spend, "This reset undid every act of this build it could.");
    expect(done.outcome).toBe("done");
    const value = ending.gateUnsatisfiable(reset, done, [{ act: "act-1", did: "press \"Mark\" button" }]);
    expect(value).toMatchObject({ outcome: "blocked", terminalReason: "gate_unsatisfiable", reason: "This reset undid every act of this build it could." });
    expect(automationStudioProjectBuilderReturn.issues(value, reset)).toEqual([]);
    expect(automationStudioProjectBuilderReturn.parse(JSON.parse(JSON.stringify(value)))).toMatchObject({ status: "valid", value: { terminalReason: "gate_unsatisfiable" } });
  });

  it("names them in a blocked reset's reason, keeps a closed reason already set, and leaves a done build and a build with none alone", () => {
    const reset = resetBrief();
    const build = gardenBrief("b-read", "list_seeds");
    const acts = [{ act: "act-1", did: "press \"Mark\" button" }];
    const blocked = ending.notStarted(reset, "The reset could not start.");
    expect(ending.gateUnsatisfiable(reset, blocked, acts)).toMatchObject({ outcome: "blocked", terminalReason: "gate_unsatisfiable", reason: "The reset could not start. 1 act of this build is left on the site, as nothing can check or put it back: act-1 (press \"Mark\" button)." });
    const stopped = ending.thrown(build, new Error("aborted"), true, spend);
    expect(ending.gateUnsatisfiable(build, stopped, acts)).toMatchObject({ terminalReason: "stopped", reason: stopped.reason });
    const notDone = ending.notStarted(build, "Nothing was explored.");
    expect(ending.gateUnsatisfiable(build, notDone, [])).toBe(notDone);
    expect(ending.gateUnsatisfiable(build, notDone, acts)).toMatchObject({ outcome: "blocked", terminalReason: "gate_unsatisfiable", reason: "Nothing was explored." });
  });

  it("a reset brief whose only acts left are such acts completes at once and comes back blocked, naming them as left", async () => {
    let decisions = 0;
    const ports: AutomationStudioProjectResetPorts = {
      loop: {
        tools: [LOOK],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
        decide: async () => {
          decisions += 1;
          return { kind: "complete", result: { summary: "Nothing is left to undo." } };
        }
      }
    };
    const build = await gardenBuild({ capacity: 1, briefs: [resetBrief()], ports: { reset: () => ports } });
    withUnsettleable(build.ledger);
    const { returns } = await build.run();
    expect(decisions).toBe(1);
    expect(returns[0]).toMatchObject({ briefId: "b-reset", outcome: "blocked", terminalReason: "gate_unsatisfiable" });
    expect(returns[0]!.reason).toContain("1 act of this build can no longer be checked or put back, so it may still be on the site: clicked “Mark”.");
  });

  it("a build brief that comes back blocked carries gate_unsatisfiable, read off the ledger", async () => {
    const stopped = async (): Promise<AutomationStudioSubflowBuilderOutcome> => ({ loop: { ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps: [], accounting: {} }, proposal: undefined, trial: undefined, promotionAllowed: false } as unknown as AutomationStudioSubflowBuilderOutcome);
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], scripts: { "b-read": stopped } });
    withUnsettleable(build.ledger, "b-earlier");
    const { returns } = await build.run();
    expect(returns[0]).toMatchObject({ briefId: "b-read", outcome: "blocked", terminalReason: "gate_unsatisfiable" });
  });
});
