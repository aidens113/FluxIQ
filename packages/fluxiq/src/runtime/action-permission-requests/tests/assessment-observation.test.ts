import { describe, expect, it, vi } from "vitest";
import { AutomationStudioActionPermissionGate, automationStudioActionPermissionDenied, type AutomationStudioActionDeclaration } from "../index.ts";
import { runWithAutomationStudioActionAssessments, type AutomationStudioActionAssessmentEvent } from "../assessment-observation/index.ts";

const SOURCE = { kind: "exploration_step" as const, id: "core.run_node", ref: "actual-call" };
const READ: AutomationStudioActionDeclaration = {
  consequences: [], control: { name: "Read inventory", kind: "list" }, verb: "read", effect: "observe",
  actionEffect: { effectClass: "observe", permissionConsequences: [] }
};

function gate() {
  return new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false, permittedConsequences: ["delete", "move_money"] });
}

describe("private actual action-assessment observation", () => {
  it.each([
    { changes: {}, expected: { effectClass: "observe", permissionConsequences: [] } },
    { changes: { effect: "mutate", actionEffect: undefined }, expected: { effectClass: "state", permissionConsequences: [] } },
    { changes: { effect: "mutate", actionEffect: { effectClass: "state", permissionConsequences: [], repeatSafe: true } }, expected: { effectClass: "state", permissionConsequences: [], repeatSafe: true } },
    { changes: { actionEffect: { effectClass: "commit", permissionConsequences: [] } }, expected: { effectClass: "commit", permissionConsequences: [] } },
    { changes: { consequences: ["delete"], actionEffect: { effectClass: "state", permissionConsequences: ["move_money"] } }, expected: { effectClass: "commit", permissionConsequences: ["move_money", "delete"] } },
    { changes: { consequences: ["delete"] }, expected: { effectClass: "observe", permissionConsequences: [] } }
  ])("preserves the normalized full floor rather than the lossy history %#", async ({ changes, expected }) => {
    const events: AutomationStudioActionAssessmentEvent[] = [];
    await runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event) },
      () => gate().checkFor(SOURCE)({ ...READ, ...changes } as AutomationStudioActionDeclaration));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "started", source: SOURCE });
    expect(events[1]).toMatchObject({ kind: "settled", value: { effect: expected, permitted: true } });
  });

  it("observes beyond the display-history cap and never carries control text", async () => {
    const events: AutomationStudioActionAssessmentEvent[] = [];
    const run = gate();
    await runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event) }, async () => {
      for (let index = 0; index < 501; index++) await run.checkFor(SOURCE)(READ);
    });
    expect(run.declarations).toHaveLength(500);
    expect(events).toHaveLength(1002);
    expect(JSON.stringify(events)).not.toContain("Read inventory");
  });

  it("instruments the no-run check without inventing primary ownership", async () => {
    const events: AutomationStudioActionAssessmentEvent[] = [];
    await runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event) },
      () => automationStudioActionPermissionDenied(READ));
    expect(events[0]).not.toHaveProperty("source");
    expect(events[1]).toMatchObject({ kind: "settled", value: { permitted: true } });
  });

  it("vetoes before instruction derivation or a permission request and cannot grant", async () => {
    const derive = vi.fn(async () => []);
    const run = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false, deriveInstructed: derive });
    const declaration: AutomationStudioActionDeclaration = { ...READ, effect: "mutate", consequences: ["delete"], actionEffect: { effectClass: "commit", permissionConsequences: [] } };
    const events: AutomationStudioActionAssessmentEvent[] = [];
    const verdict = await runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event), veto: () => true },
      () => run.checkFor(SOURCE)(declaration));
    expect(verdict).toEqual({ permitted: false, missing: [], requestId: null });
    expect(derive).not.toHaveBeenCalled();
    expect(run.request).toBeUndefined();
    expect(events[1]).toMatchObject({ kind: "settled", value: { permitted: false } });
    expect((await runWithAutomationStudioActionAssessments({ observe: () => undefined, veto: () => false },
      () => run.checkFor(SOURCE)(declaration))).permitted).toBe(false);
    expect(run.request?.missing).toEqual(["delete"]);
  });

  it("leaves a failed declaration pending and treats a preflight exception as refusal", async () => {
    const events: AutomationStudioActionAssessmentEvent[] = [];
    await expect(runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event) },
      () => gate().checkFor(SOURCE)({ ...READ, verb: "!" }))).rejects.toThrow();
    expect(events).toHaveLength(1);
    expect(await runWithAutomationStudioActionAssessments({ observe: () => undefined, veto: () => { throw new Error("private-scope-error"); } },
      () => gate().checkFor(SOURCE)(READ))).toEqual({ permitted: false, missing: [], requestId: null });
  });

  it("notifies active ancestors while isolating concurrent scopes", async () => {
    const outer: AutomationStudioActionAssessmentEvent[] = [];
    const inner: AutomationStudioActionAssessmentEvent[] = [];
    const parallel: AutomationStudioActionAssessmentEvent[] = [];
    await Promise.all([
      runWithAutomationStudioActionAssessments({ observe: (event) => outer.push(event) }, async () => {
        await runWithAutomationStudioActionAssessments({ observe: (event) => inner.push(event) }, () => gate().checkFor(SOURCE)(READ));
      }),
      runWithAutomationStudioActionAssessments({ observe: (event) => parallel.push(event) }, () => gate().checkFor({ ...SOURCE, ref: "parallel" })(READ))
    ]);
    expect(outer).toEqual(inner);
    expect(outer).toHaveLength(2);
    expect(parallel[0]).toMatchObject({ source: { ref: "parallel" } });
  });

  it("shares scoped hooks across independently loaded Core copies", async () => {
    vi.resetModules();
    const copy = await import("../gate.ts");
    const events: AutomationStudioActionAssessmentEvent[] = [];
    await runWithAutomationStudioActionAssessments({ observe: (event) => events.push(event) }, () =>
      new copy.AutomationStudioActionPermissionGate({ stage: "authoring" }).checkFor(SOURCE)(READ));
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ value: { effect: { effectClass: "observe" } } });
  });
});
