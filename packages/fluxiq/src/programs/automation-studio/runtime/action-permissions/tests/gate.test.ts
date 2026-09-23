// The permission gate, on its own: what a run permits, what it asks, and what
// a request may carry out to a person.
//
// Two properties are load-bearing and each is a mutation this file must catch:
// an absent grant never permits a lasting consequence, and an action the run
// does not hold never proceeds without a request being raised.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCES,
  AutomationStudioActionDeclarationError,
  AutomationStudioActionPermissionGate,
  automationStudioActionPermissionDenied,
  parseAutomationStudioActionPermissionRequest,
  parseAutomationStudioPermittedConsequences,
  type AutomationStudioActionDeclaration
} from "../index.ts";

const REFUND: AutomationStudioActionDeclaration = { consequences: ["modify_existing", "move_money"], control: { name: "Refund line 1", kind: "button" }, verb: "press" };
const STEP = { kind: "exploration_step" as const, id: "demo.press", ref: "call.7" };

function gate(permittedConsequences?: readonly string[]) {
  const built = new AutomationStudioActionPermissionGate({
    permittedConsequences,
    stage: "authoring",
    instructionIds: ["instruction.refund"],
    now: () => 1_789_000_000_000,
    newRequestId: () => "permission-request:one"
  });
  built.observe({ kind: "llm_evidence_tool_execution", evidence: { controls: [{ handle: "c4", name: "Refund  line 1" }] }, effectApplied: false });
  return built;
}

describe("the action permission gate", () => {
  it("permits nothing lasting when the grant says nothing, and asks instead", async () => {
    const run = gate(undefined);
    const verdict = await run.checkFor(STEP)(REFUND);

    expect(verdict).toEqual({ permitted: false, missing: ["move_money", "modify_existing"], requestId: "permission-request:one" });
    expect(run.request).toEqual({
      schemaVersion: "automation-studio.action-permission-request.v1",
      requestId: "permission-request:one",
      requestedAtMs: 1_789_000_000_000,
      action: { kind: "exploration_step", id: "demo.press", ref: "call.7", verb: "press" },
      control: { name: "Refund line 1", kind: "button" },
      consequences: ["move_money", "modify_existing"],
      missing: ["move_money", "modify_existing"],
      reason: { stage: "authoring", instructionIds: ["instruction.refund"] },
      authority: { granted: [], instructed: [] },
      sentence: "To build the Flow its instruction describes, the run needed to press \"Refund line 1\" (button), which would spend, refund or move money and change something that already exists. Neither its instruction nor a grant allows that, so it stopped to ask."
    });
    expect(run.raisedDuring("call.7")).toBe(true);
    expect(run.signal.aborted).toBe(true);
  });

  it("permits nothing lasting on an empty grant either", async () => {
    expect((await gate([]).checkFor(STEP)(REFUND)).permitted).toBe(false);
  });

  it("permits an action whose every consequence the grant holds, and raises nothing", async () => {
    const run = gate(["move_money", "modify_existing"]);

    expect(await run.checkFor(STEP)(REFUND)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.signal.aborted).toBe(false);
  });

  it("asks for exactly what the grant lacks, never what it already holds", async () => {
    const run = gate(["modify_existing"]);

    expect(await run.checkFor(STEP)(REFUND)).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(run.request?.missing).toEqual(["move_money"]);
    expect(run.request?.consequences).toEqual(["move_money", "modify_existing"]);
  });

  it("never reads a class it does not recognise as a grant", async () => {
    const run = gate(["purchase", "refund", "*", "MOVE_MONEY"]);

    expect((await run.checkFor(STEP)({ consequences: ["move_money"], control: { name: "Refund line 1" }, verb: "press" })).permitted).toBe(false);
  });

  it("keeps the first request and still refuses what comes after it", async () => {
    const run = gate([]);
    await run.checkFor(STEP)(REFUND);
    const later = await run.checkFor({ kind: "flow_step", id: "demo.orders.press", ref: "main.s4" })({ consequences: ["delete"], control: { name: "Refund line 1" }, verb: "press" });

    expect(later).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:one" });
    expect(run.request?.action.ref).toBe("call.7");
    expect(run.raisedDuring("main.s4")).toBe(false);
  });

  it("describes a Flow step as something the Flow would do each time it runs", async () => {
    const run = gate([]);
    await run.checkFor({ kind: "flow_step", id: "demo.orders.press", ref: "main.s3" })(REFUND);

    expect(run.request?.action).toEqual({ kind: "flow_step", id: "demo.orders.press", ref: "main.s3", verb: "press" });
    expect(run.request?.sentence).toBe("The Flow its instruction describes would press \"Refund line 1\" (button) each time it runs, which would spend, refund or move money and change something that already exists. Neither its instruction nor a grant allows that, so the build stopped to ask.");
  });

  it("refuses a declaration it cannot read, and the action with it", async () => {
    const check = gate(["move_money"]).checkFor(STEP);
    const malformed: unknown[] = [
      undefined,
      // An empty list is a declaration -- "this acts and causes nothing
      // lasting" -- and is read, recorded and permitted. A missing key still is
      // not: saying nothing and saying none are different facts.
      { control: { name: "Refund" }, verb: "press" },
      { consequences: "none", control: { name: "Refund" }, verb: "press" },
      { consequences: ["purchase"], control: { name: "Refund" }, verb: "press" },
      { consequences: ["move_money"], control: { name: "" }, verb: "press" },
      { consequences: ["move_money"], control: { name: "Refund", kind: "<button>" }, verb: "press" },
      { consequences: ["move_money"], control: { name: "Refund" }, verb: "Press!" },
      { consequences: ["move_money"], control: { name: "Refund" }, verb: "press", extra: true }
    ];

    for (const declaration of malformed) {
      await expect(check(declaration as AutomationStudioActionDeclaration)).rejects.toThrow(AutomationStudioActionDeclarationError);
    }
  });
});

describe("what a request may carry out to a person", () => {
  it("withholds a control name the model was never shown", async () => {
    const run = gate([]);
    await run.checkFor(STEP)({ consequences: ["delete"], control: { name: "#order-40100 > button.danger" }, verb: "press" });

    expect(run.request?.control.name).toBeNull();
    expect(run.request?.sentence).toContain("a control it cannot name here");
    expect(JSON.stringify(run.request)).not.toContain("danger");
  });

  it("withholds a name that carries markup even when it was shown", async () => {
    const run = new AutomationStudioActionPermissionGate({ stage: "recovery" });
    run.observe({ html: "<button>Delete</button>" });
    await run.checkFor(STEP)({ consequences: ["delete"], control: { name: "<button>Delete</button>" }, verb: "press" });

    expect(run.request?.control.name).toBeNull();
    expect(run.request?.reason).toEqual({ stage: "recovery", instructionIds: [] });
  });

  it("cuts a long shown name rather than carrying all of it", async () => {
    const long = `Refund ${"the walnut desk and its matching chair ".repeat(6)}`.trim();
    const run = new AutomationStudioActionPermissionGate({ stage: "authoring" });
    run.observe([long]);
    await run.checkFor(STEP)({ consequences: ["move_money"], control: { name: long }, verb: "press" });

    expect(run.request?.control.name?.length).toBeLessThanOrEqual(120);
    expect(run.request?.control.name?.endsWith("...")).toBe(true);
  });

  it("round-trips through the strict parser, and the parser refuses a request it did not build", async () => {
    const run = gate([]);
    await run.checkFor(STEP)(REFUND);
    const request = run.request!;

    expect(parseAutomationStudioActionPermissionRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    expect(parseAutomationStudioActionPermissionRequest({ ...request, extra: 1 })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, missing: ["delete"] })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, missing: [] })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, consequences: ["modify_existing", "move_money"] })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, control: { name: "<b>Refund</b>", kind: null } })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, action: { ...request.action, kind: "later" } })).toBeNull();
  });
});

describe("the check an action gets with no run behind it", () => {
  it("permits nothing lasting and names no request", async () => {
    expect(await automationStudioActionPermissionDenied(REFUND)).toEqual({ permitted: false, missing: ["move_money", "modify_existing"], requestId: null });
    await expect(automationStudioActionPermissionDenied({} as AutomationStudioActionDeclaration)).rejects.toThrow(AutomationStudioActionDeclarationError);
  });
});

describe("the permission set a grant carries", () => {
  it("is empty when absent, and in Core's order without repeats when given", async () => {
    expect(parseAutomationStudioPermittedConsequences(undefined)).toEqual([]);
    expect(parseAutomationStudioPermittedConsequences(["create_new", "move_money", "create_new"])).toEqual(["move_money", "create_new"]);
    expect(parseAutomationStudioPermittedConsequences([...AUTOMATION_STUDIO_ACTION_CONSEQUENCES].reverse())).toEqual([...AUTOMATION_STUDIO_ACTION_CONSEQUENCES]);
  });

  it("refuses the whole set when any class is unrecognised, rather than dropping it", async () => {
    expect(() => parseAutomationStudioPermittedConsequences(["move_money", "purchase"])).toThrow(/does not recognise/);
    expect(() => parseAutomationStudioPermittedConsequences("move_money")).toThrow(/list/);
    expect(() => parseAutomationStudioPermittedConsequences(null)).toThrow(/list/);
  });
});
