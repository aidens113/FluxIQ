// The permission gate, on its own: what a run permits, what it asks, and what
// a request may carry out to a person.
//
// Two properties are load-bearing and each is a mutation this file must catch:
// an absent permitted set never permits a consequence that cannot be taken back, and an
// action the run does not hold never proceeds without a request being raised.
//
// `REFUND` declares money and an edit, and since 2026-09-26 only the first is
// asked about. That is deliberate here: a request carries every class the action
// declared and asks about only the classes a person must answer for, and holding
// the two apart is most of what these rows check.

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
  it("permits nothing it cannot take back when the permitted set says nothing, and asks instead", async () => {
    const run = gate(undefined);
    const verdict = await run.checkFor(STEP)(REFUND);

    expect(verdict).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:one" });
    expect(run.request).toEqual({
      schemaVersion: "automation-studio.action-permission-request.v1",
      requestId: "permission-request:one",
      requestedAtMs: 1_789_000_000_000,
      action: { kind: "exploration_step", id: "demo.press", ref: "call.7", verb: "press" },
      control: { name: "Refund line 1", kind: "button" },
      consequences: ["move_money", "modify_existing"],
      missing: ["move_money"],
      reason: { stage: "authoring", instructionIds: ["instruction.refund"] },
      authority: { granted: [], instructed: [] },
      sentence: "FluxIQ needs to press \"Refund line 1\" (button) to build this Flow. That would spend, refund or move money, and that always needs your permission, even when your instruction asks for it."
    });
    expect(run.raisedDuring("call.7")).toBe(true);
    expect(run.signal.aborted).toBe(true);
  });

  it("permits nothing it cannot take back on an empty permitted set either", async () => {
    expect((await gate([]).checkFor(STEP)(REFUND)).permitted).toBe(false);
  });

  it("names every missing class in one sentence, in Core's order", async () => {
    const run = gate([]);
    await run.checkFor(STEP)({ consequences: ["delete", "move_money"], control: { name: "Refund line 1", kind: "button" }, verb: "press" });

    expect(run.request?.missing).toEqual(["move_money", "delete"]);
    expect(run.request?.sentence).toBe("FluxIQ needs to press \"Refund line 1\" (button) to build this Flow. That would spend, refund or move money and delete or remove something, and that always needs your permission, even when your instruction asks for it.");
  });

  it("permits an action whose every consequence the run is permitted, and raises nothing", async () => {
    const run = gate(["move_money", "modify_existing"]);

    expect(await run.checkFor(STEP)(REFUND)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.signal.aborted).toBe(false);
  });

  // Three classes, and three different reasons not to ask about one: the run is permitted
  // holds `delete`, nobody is asked about `modify_existing` any more, and
  // `move_money` is neither -- so it is the only thing the request carries.
  it("asks for exactly what the permitted set lacks, never what it already holds", async () => {
    const run = gate(["delete"]);
    const voidLine: AutomationStudioActionDeclaration = { consequences: ["move_money", "delete", "modify_existing"], control: { name: "Refund line 1", kind: "button" }, verb: "press" };

    expect(await run.checkFor(STEP)(voidLine)).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(run.request?.missing).toEqual(["move_money"]);
    expect(run.request?.consequences).toEqual(["move_money", "delete", "modify_existing"]);
  });

  it("never reads a class it does not recognise as permitted", async () => {
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
    expect(run.request?.sentence).toBe("The Flow would press \"Refund line 1\" (button) each time it runs. That would spend, refund or move money, and that always needs your permission, even when your instruction asks for it.");
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

// A person's no and nobody answering used to settle the same way: the first
// request stayed raised and refused everything after it with its own id. So a
// build told no about "Continue to checkout" could never ask about "Place
// order" (t195-w18). A no is now remembered for its question only.
describe("how a person's answer settles a request", () => {
  const CHECKOUT: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Continue to checkout", kind: "button" }, verb: "press" };
  const PLACE: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Place order", kind: "button" }, verb: "press" };

  function asking() {
    let next = 0;
    const built = new AutomationStudioActionPermissionGate({ stage: "authoring", endsOnRequest: false, newRequestId: () => `permission-request:${++next}` });
    built.observe({ controls: ["Continue to checkout", "Place order"] });
    return built;
  }

  it("asks about a different control after a decline, and a grant there permits it", async () => {
    const run = asking();
    expect(await run.checkFor(STEP)(CHECKOUT)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1" });
    run.settle("declined");

    const place = run.checkFor({ kind: "exploration_step", id: "demo.press", ref: "call.9" });
    expect(await place(PLACE)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:2" });
    expect(run.request).toMatchObject({ requestId: "permission-request:2", control: { name: "Place order" } });
    run.settle("granted");

    expect(await place(PLACE)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
  });

  it("refuses the declined question again unasked, with its own request, even after a grant of the same class elsewhere", async () => {
    const run = asking();
    await run.checkFor(STEP)(CHECKOUT);
    run.settle("declined");
    await run.checkFor({ kind: "exploration_step", id: "demo.press", ref: "call.9" })(PLACE);
    run.settle("granted");

    const again = await run.checkFor({ kind: "flow_step", id: "demo.press", ref: "main.s2" })(CHECKOUT);
    expect(again).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    // The request the run now ends on is the one that refused it, not a new one.
    expect(run.request?.requestId).toBe("permission-request:1");
    expect(run.raisedDuring("call.7")).toBe(true);
  });

  // A decline is an answer, not a question still standing. Carried on, it ended
  // every later stalled round as that question and made a Flow that never
  // presses the control unapprovable; only a Flow step that needs it puts it back.
  it("carries a declined request only while a step of the Flow needs it", async () => {
    const run = asking();
    await run.checkFor(STEP)(CHECKOUT);
    run.settle("declined");
    expect(run.request).toBeUndefined();

    const explored = await run.checkFor({ kind: "exploration_step", id: "demo.press", ref: "call.8" })(CHECKOUT);
    expect(explored).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    expect(run.request).toBeUndefined();

    await run.checkFor({ kind: "flow_step", id: "demo.press", ref: "main.s3" })(CHECKOUT);
    expect(run.request?.requestId).toBe("permission-request:1");
  });

  it("is a new question when the same control is asked about other classes", async () => {
    const run = asking();
    await run.checkFor(STEP)(CHECKOUT);
    run.settle("declined");

    const deleting = await run.checkFor(STEP)({ ...CHECKOUT, consequences: ["delete"] });
    expect(deleting).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:2" });
    // And the money it was refused stays refused, with the request the person answered.
    run.settle("granted");
    expect(await run.checkFor(STEP)(CHECKOUT)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
  });

  it("keeps a request nobody answered in force, so nothing after it is asked", async () => {
    for (const answer of ["unanswered", "refused"] as const) {
      const run = asking();
      await run.checkFor(STEP)(CHECKOUT);
      run.settle(answer);

      const later = await run.checkFor({ kind: "flow_step", id: "demo.press", ref: "main.s2" })(PLACE);
      expect(later, answer).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1" });
      expect(run.request?.requestId, answer).toBe("permission-request:1");
    }
  });
});

describe("the check an action gets with no run behind it", () => {
  it("permits nothing it cannot take back and names no request", async () => {
    expect(await automationStudioActionPermissionDenied(REFUND)).toEqual({ permitted: false, missing: ["move_money"], requestId: null });
    await expect(automationStudioActionPermissionDenied({} as AutomationStudioActionDeclaration)).rejects.toThrow(AutomationStudioActionDeclarationError);
  });
});

describe("the permission set a run carries", () => {
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
