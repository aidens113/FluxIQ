// A brief mapped onto its builder's scope: which of its inputs an earlier subflow hands on (t672), by the rule assembly
// binds them by (`../call-order.ts`), so an unread one is accepted and every other one is the person's value.
import { describe, expect, it } from "vitest";
import { automationStudioProjectStructurePlan, type AutomationStudioProjectStructurePlan, type AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectBuildRecord } from "../../record/index.ts";
import { automationStudioProjectDispatchScope } from "../scope.ts";
import { gardenBrief, gardenPlan, gardenTaskSpec } from "./dispatch-fixture.ts";

const port = (id: string) => ({ id, name: id, valueType: { kind: "unknown" as const } });

/** The garden plan with `open_packet` handing back `packet`, which `plant_packet` takes, and a `rows` the person gives. */
function handingOnPlan(): AutomationStudioProjectStructurePlan {
  const { digest: _digest, ...plan } = gardenPlan();
  for (const subflow of plan.plan.subflows) {
    if (subflow.key === "open_packet") subflow.interface = { inputs: [], outputs: [port("packet")] };
    if (subflow.key === "plant_packet") subflow.interface = { inputs: [port("packet"), port("rows")], outputs: [] };
  }
  return { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) };
}

function recordOf(plan: AutomationStudioProjectStructurePlan, briefs: AutomationStudioProjectSubflowBrief[]): AutomationStudioProjectBuildRecord {
  return { buildId: "build.garden", taskSpecs: [{ revision: 1, recordedAt: 1, taskSpec: gardenTaskSpec() }], plans: [{ revision: 1, recordedAt: 1, plan }], briefs: briefs.map((brief) => ({ recordedAt: 2, brief })) } as unknown as AutomationStudioProjectBuildRecord;
}

function briefOf(plan: AutomationStudioProjectStructurePlan, briefId: string, subflowKey: string, predecessors: string[]): AutomationStudioProjectSubflowBrief {
  return gardenBrief(briefId, subflowKey, predecessors, (brief) => {
    brief.planDigest = plan.digest;
    brief.interface = structuredClone(plan.plan.subflows.find((subflow) => subflow.key === subflowKey)!.interface!);
  });
}

describe("a brief's scope", () => {
  it("names the inputs an earlier subflow hands on, and leaves the person's values out", () => {
    const plan = handingOnPlan();
    const planting = briefOf(plan, "b-plant", "plant_packet", ["open_packet"]);
    const { scope } = automationStudioProjectDispatchScope(recordOf(plan, [planting]), planting);
    expect(scope.handedOn).toEqual(["packet"]);
  });

  it("reads the call order as assembly does: a producer that runs after the consumer hands it nothing", () => {
    const plan = handingOnPlan();
    // `plant_packet` named to run before `open_packet` by the latter's brief: the packet it takes is the Flow's own.
    const opening = briefOf(plan, "b-open", "open_packet", ["plant_packet"]);
    const planting = briefOf(plan, "b-plant", "plant_packet", []);
    expect(automationStudioProjectDispatchScope(recordOf(plan, [opening, planting]), planting).scope.handedOn).toBeUndefined();
  });

  // A8 frozen pair 8 (t676): a builder did a later part's lasting act while it explored; nothing named that part as another builder's.
  it("carries the task's other parts, by id and the person's words, as out of its scope", () => {
    const plan = gardenPlan();
    const opening = gardenBrief("b-open", "open_packet", ["list_seeds"]);
    const { scope } = automationStudioProjectDispatchScope(recordOf(plan, [opening]), opening);
    const own = new Set(opening.parts);
    const others = gardenTaskSpec().parts.filter((part) => !own.has(part.id)).map((part) => ({ partId: part.id, text: part.quote.text }));
    expect(others.length).toBeGreaterThan(0);
    expect(scope.outOfScope).toEqual(others);
    for (const part of scope.outOfScope!) expect(scope.parts.map((held) => held.partId)).not.toContain(part.partId);
  });

  it("carries none for a brief whose inputs are all the person's", () => {
    const plan = gardenPlan();
    const opening = gardenBrief("b-open", "open_packet", ["list_seeds"]);
    expect(automationStudioProjectDispatchScope(recordOf(plan, [opening]), opening).scope.handedOn).toBeUndefined();
  });
});
