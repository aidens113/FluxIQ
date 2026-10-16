// Core's sizing of the briefs a dispatch sends (t570): money and calls split
// over the briefs sent, the plan's subflows still to brief and one share for
// the build's own finishing; the supervisor's figures only lower a share; a
// reset takes the calls kept back for it; and a refusal only once there is too
// little left to finish anything.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../../loop-limits/index.ts";
import { automationStudioProjectStructurePlan, type AutomationStudioProjectStructurePlan } from "../../contracts/index.ts";
import { gardenBuild, REF } from "../../dispatch/tests/dispatch-fixture.ts";
import { automationStudioProjectSupervisorBriefSizing } from "../brief-sizing.ts";

/** A plan of one subflow the router runs, with no inputs or outputs (t679). */
function singleStructure(): AutomationStudioProjectStructurePlan {
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: "f".repeat(64),
    plan: { schemaVersion: "0.1", router: { name: "Plots", rules: [], fallback: { kind: "subflow", targetSubflowKey: "book_plot" } }, subflows: [{ key: "book_plot", name: "Book plot", role: "primary", nodes: [], edges: [] }] },
    partOf: { book_plot: ["p1"] }
  };
  return { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) };
}

/** A purse of $0.25 and 64 calls keeping 10 back, with `settled` calls of $0.001 already settled. */
function pricedPurse(settled: number): AutomationStudioLlmBuildPurse {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: 64 });
  purse.keepBackCallsFromAllowances(10);
  for (let index = 0; index < settled; index += 1) {
    const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 10 });
    if (held.ok) held.hold.settle({ estimatedCostUsd: 0.001 });
  }
  return purse;
}

async function gardenStructure() {
  const build = await gardenBuild({ capacity: 1, briefs: [] });
  return (await build.store.read(REF))!.record.plans.at(-1)!.plan;
}

describe("Core's sizing of a dispatch's briefs", () => {
  it("splits money and calls over the briefs sent, the subflows still to brief and the build's finishing, and lets the supervisor lower one", async () => {
    const structure = await gardenStructure();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: 64 });
    purse.keepBackCallsFromAllowances(10);
    const sized = automationStudioProjectSupervisorBriefSizing({
      sent: [{ kind: "build", subflowKey: "list_seeds", allowanceUsd: 0.5, maxIterations: 40 }, { kind: "build", subflowKey: "open_packet", allowanceUsd: 0.01, maxIterations: 6 }],
      purse, structure, done: new Set(), supervisorCalls: 4
    });
    // Two sent, plant_packet still to brief, and the finishing share: four shares of $0.25 and of 54 calls.
    expect(sized).toEqual({ ok: true, sizes: [{ allowanceUsd: 0.0625, maxIterations: 13, maxCalls: 13 }, { allowanceUsd: 0.01, maxIterations: 6, maxCalls: 13 }] });
    // A subflow with a done proposal needs no share.
    const later = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "plant_packet" }], purse, structure, done: new Set(["list_seeds", "open_packet"]), supervisorCalls: 4 });
    expect(later).toEqual({ ok: true, sizes: [{ allowanceUsd: 0.125, maxIterations: 27, maxCalls: 27 }] });
  });

  it("never gives a brief more turns than its builder's loop takes, and keeps the rest of a large share's calls (t577)", async () => {
    const structure = await gardenStructure();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: 250 });
    purse.keepBackCallsFromAllowances(10);
    const sized = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "plant_packet", maxIterations: 200 }], purse, structure, done: new Set(["list_seeds", "open_packet"]), supervisorCalls: 4 });
    // One brief and the finishing share of 240 calls: 120 calls, but the loop refuses more than its own turns.
    expect(sized).toEqual({ ok: true, sizes: [{ allowanceUsd: 0.125, maxIterations: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations, maxCalls: 120 }] });
  });

  it("gives a reset the calls kept back for the finishing, less the supervisor's own last decisions", async () => {
    const structure = await gardenStructure();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: 20 });
    purse.keepBackCallsFromAllowances(10);
    for (let index = 0; index < 10; index += 1) {
      const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 10 });
      if (held.ok) held.hold.settle({ estimatedCostUsd: 0.001 });
    }
    expect(purse.allocatableCalls()).toBe(0);
    const sized = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "reset", subflowKey: "list_seeds" }], purse, structure, done: new Set(["list_seeds", "open_packet", "plant_packet"]), supervisorCalls: 4 });
    expect(sized).toMatchObject({ ok: true, sizes: [{ maxCalls: 6, maxIterations: 6 }] });
  });

  it("refuses only when what is left is too little for a builder to finish in, with the figures", async () => {
    const structure = await gardenStructure();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS * 2 + 1 });
    const one = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "list_seeds" }], purse, structure, done: new Set(["open_packet", "plant_packet"]), supervisorCalls: 4 });
    expect(one.ok).toBe(true);
    const three = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "list_seeds" }, { kind: "build", subflowKey: "open_packet" }, { kind: "build", subflowKey: "plant_packet" }], purse, structure, done: new Set(), supervisorCalls: 4 });
    expect(three).toEqual({ ok: false, canGiveUsd: 0.25, canGiveCalls: AUTOMATION_STUDIO_SUBFLOW_BRIEF_MIN_CALLS * 2 + 1, shares: 4 });
  });

  // t679: a single-subflow plan's builder test is the judged whole run, so its one brief needs no even finishing share.
  it("gives a single-subflow plan's one build brief what the purse can carve less its finishing calls, at the average settled call", () => {
    const purse = pricedPurse(2);
    const canGive = purse.allocatableUsd();
    const sized = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "book_plot" }], purse, structure: singleStructure(), done: new Set(), supervisorCalls: 4, finishingCalls: 10 });
    // Ten finishing calls at $0.001 each; every call the purse can carve (62 settled-less, 10 kept back: 52).
    expect(sized).toMatchObject({ ok: true, sizes: [{ maxCalls: purse.allocatableCalls(), maxIterations: purse.allocatableCalls() }] });
    if (!sized.ok) throw new Error("refused");
    expect(sized.sizes[0]!.allowanceUsd).toBeCloseTo(canGive - 0.01, 9);
    // A repair of it is sized the same; the supervisor may still lower it.
    const repair = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "repair", subflowKey: "book_plot", allowanceUsd: 0.05 }], purse, structure: singleStructure(), done: new Set(), supervisorCalls: 4, finishingCalls: 10 });
    expect(repair).toMatchObject({ ok: true, sizes: [{ allowanceUsd: 0.05 }] });
  });

  it("gives a single-subflow brief the even share while no call has settled, or no finishing calls are kept back", () => {
    const unpriced = pricedPurse(0);
    const even = unpriced.allocatableUsd() / 2;
    expect(automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "book_plot" }], purse: unpriced, structure: singleStructure(), done: new Set(), supervisorCalls: 4, finishingCalls: 10 })).toMatchObject({ ok: true, sizes: [{ allowanceUsd: even }] });
    const priced = pricedPurse(2);
    expect(automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "book_plot" }], purse: priced, structure: singleStructure(), done: new Set(), supervisorCalls: 4 })).toMatchObject({ ok: true, sizes: [{ allowanceUsd: priced.allocatableUsd() / 2, maxCalls: Math.floor(priced.allocatableCalls()! / 2) }] });
  });

  it("sizes every brief of a plan of several subflows as before, finishing calls or not", async () => {
    const structure = await gardenStructure();
    const purse = pricedPurse(2);
    const without = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "plant_packet" }], purse, structure, done: new Set(["list_seeds", "open_packet"]), supervisorCalls: 4 });
    const withCalls = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "plant_packet" }], purse, structure, done: new Set(["list_seeds", "open_packet"]), supervisorCalls: 4, finishingCalls: 10 });
    expect(withCalls).toEqual(without);
    expect(withCalls).toMatchObject({ ok: true, sizes: [{ allowanceUsd: purse.allocatableUsd() / 2 }] });
  });

  it("sizes the turns where the purse caps no calls, and gives no call cap", async () => {
    const structure = await gardenStructure();
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.2 });
    const sized = automationStudioProjectSupervisorBriefSizing({ sent: [{ kind: "build", subflowKey: "list_seeds" }], purse, structure, done: new Set(["open_packet", "plant_packet"]), supervisorCalls: 4 });
    expect(sized).toEqual({ ok: true, sizes: [{ allowanceUsd: 0.1, maxIterations: 30 }] });
  });
});
