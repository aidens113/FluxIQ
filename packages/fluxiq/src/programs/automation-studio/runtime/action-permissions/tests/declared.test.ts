// What the gate keeps of every declaration, and what Core makes of it when it
// is held against the person's own instruction.
//
// The property these rows exist to protect is one sentence: a permitted action
// must leave behind what it said about itself. Four live builds on 2026-09-22
// authored Flows containing presses and nobody could say what any press had
// declared, because a permitted verdict discarded the declaration where it was
// read. Every mutation that returns to discarding it, or that stops recording
// the empty answer -- which is the answer every measured press actually gave --
// fails here.

import { describe, expect, it } from "vitest";
import {
  AutomationStudioActionPermissionGate,
  automationStudioActionDeclarationCrossCheck,
  automationStudioActionPermissionDenied,
  automationStudioDeclaredConsequences,
  type AutomationStudioActionDeclaration,
  type AutomationStudioInstructedConsequence
} from "../index.ts";

const NOTHING_LASTING: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Schedule post", kind: "button" }, verb: "press" };
const PUBLISH: AutomationStudioActionDeclaration = { consequences: ["send_or_publish", "create_new"], control: { name: "Schedule post", kind: "button" }, verb: "press" };
const PRESS = { kind: "exploration_step" as const, id: "core.run_node", ref: "call.3" };
const STEP = { kind: "flow_step" as const, id: "web.output.dom-click", ref: "main.s4" };

const SCHEDULE: AutomationStudioInstructedConsequence = {
  consequence: "send_or_publish",
  instructionId: "instruction.schedule",
  instructionDigest: `sha256:${"0".repeat(64)}`,
  quote: "Schedule a post for Friday"
};

function gate(input: { permitted?: readonly string[]; instructed?: readonly AutomationStudioInstructedConsequence[] } = {}) {
  const built = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permitted,
    stage: "authoring",
    instructionIds: ["instruction.schedule"],
    instructed: input.instructed,
    now: () => 1_789_000_000_000,
    newRequestId: () => "permission-request:one"
  });
  built.observe({ kind: "llm_evidence_tool_execution", evidence: { controls: [{ handle: "c1", name: "Schedule post" }] }, effectApplied: false });
  return built;
}

describe("what the gate keeps of a declaration", () => {
  it("records an action that said it causes nothing lasting, and permits it", async () => {
    const run = gate();

    expect(await run.checkFor(PRESS)(NOTHING_LASTING)).toEqual({ permitted: true });
    expect(run.declarations).toEqual([{
      action: { kind: "exploration_step", id: "core.run_node", ref: "call.3", verb: "press", effect: "mutate" },
      control: { name: "Schedule post", kind: "button" },
      consequences: [],
      permitted: true
    }]);
    expect(automationStudioDeclaredConsequences(run.declarations)).toEqual([]);
  });

  it("records a permitted declaration in full, in Core's order", async () => {
    const run = gate({ permitted: ["create_new", "send_or_publish"] });

    expect(await run.checkFor(STEP)(PUBLISH)).toEqual({ permitted: true });
    expect(run.declarations[0]?.consequences).toEqual(["send_or_publish", "create_new"]);
    expect(run.declarations[0]?.permitted).toBe(true);
    expect(run.declarations[0]?.action).toEqual({ kind: "flow_step", id: "web.output.dom-click", ref: "main.s4", verb: "press", effect: "mutate" });
  });

  it("records a refusal with what was missing and which request carries it", async () => {
    const run = gate();

    expect(await run.checkFor(PRESS)(PUBLISH)).toEqual({ permitted: false, missing: ["send_or_publish", "create_new"], requestId: "permission-request:one" });
    expect(run.declarations[0]).toEqual({
      action: { kind: "exploration_step", id: "core.run_node", ref: "call.3", verb: "press", effect: "mutate" },
      control: { name: "Schedule post", kind: "button" },
      consequences: ["send_or_publish", "create_new"],
      permitted: false,
      missing: ["send_or_publish", "create_new"],
      requestId: "permission-request:one"
    });
  });

  it("withholds a control name the model was never shown, here as in the request", async () => {
    const run = gate();
    await run.checkFor(PRESS)({ consequences: [], control: { name: "#submit-7f2a", kind: "button" }, verb: "press" });

    expect(run.declarations[0]?.control).toEqual({ name: null, kind: "button" });
  });

  it("never reads the instruction for an action that declared nothing lasting", async () => {
    let derived = 0;
    const run = new AutomationStudioActionPermissionGate({
      stage: "authoring",
      deriveInstructed: async () => { derived += 1; return []; }
    });

    await run.checkFor(PRESS)(NOTHING_LASTING);
    expect(derived).toBe(0);

    await run.resolveInstructed();
    expect(derived).toBe(1);
  });

  it("permits an empty declaration even where there is nobody to ask", async () => {
    expect(await automationStudioActionPermissionDenied(NOTHING_LASTING)).toEqual({ permitted: true });
    expect(await automationStudioActionPermissionDenied(PUBLISH)).toEqual({ permitted: false, missing: ["send_or_publish", "create_new"], requestId: null });
  });
});

// The instruction is the authority: where the person's own words say to read
// the list, reading the list is the work being carried out and not a thing to
// be permitted. On 2026-09-23 a build told to collect a page of products into a
// table declared `create_new` for the node that reads the list -- a dataset
// felt like something new -- and FluxIQ stopped and asked a person for
// permission to read the page (`run-mueozmp8-348a2057`: 21 provider calls, no
// Flow, and `beyond_instruction` for the very act the instruction asked for).
// What an act means on this page is the model's word to give; whether the act
// touches anything at all is the domain's, and these rows hold the second above
// the first -- in one direction only, which the last two prove.
describe("an action that only reads", () => {
  const READS: AutomationStudioActionDeclaration = { consequences: ["create_new"], control: { name: "Schedule post", kind: "step" }, verb: "extract list", effect: "observe" };

  it("is permitted without a request, whatever classes it named", async () => {
    const run = gate();

    expect(await run.checkFor(PRESS)(READS)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
  });

  it("keeps what it named as disregarded rather than as a consequence", async () => {
    const run = gate();
    await run.checkFor(PRESS)(READS);

    expect(run.declarations[0]).toEqual({
      action: { kind: "exploration_step", id: "core.run_node", ref: "call.3", verb: "extract list", effect: "observe" },
      control: { name: "Schedule post", kind: "step" },
      consequences: [],
      permitted: true,
      disregarded: ["create_new"]
    });
    expect(automationStudioDeclaredConsequences(run.declarations)).toEqual([]);
  });

  it("never reads the instruction, and is not held against it afterwards", async () => {
    let derived = 0;
    const run = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed: async () => { derived += 1; return [SCHEDULE]; } });

    await run.checkFor(PRESS)(READS);
    expect(derived).toBe(0);

    const check = automationStudioActionDeclarationCrossCheck({ declarations: run.declarations, instructed: [] });
    expect(check.verdict).toBe("agreed");
    expect(check.beyondInstruction).toEqual([]);
    // It did not act, so it is not one of the actions that acted and said they
    // would cause nothing.
    expect(check.declaredNothing).toBe(0);
  });

  it("is permitted even where there is nobody at all to ask", async () => {
    expect(await automationStudioActionPermissionDenied(READS)).toEqual({ permitted: true });
  });

  it("does not let an act through: only the action's own effect decides", async () => {
    const run = gate();
    const purchase: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Schedule post", kind: "button" }, verb: "press", effect: "mutate" };

    expect(await run.checkFor(PRESS)(purchase)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:one" });
    expect(run.request?.missing).toEqual(["move_money"]);
    expect(run.declarations[0]?.consequences).toEqual(["move_money"]);
    expect(run.declarations[0]?.disregarded).toBeUndefined();
    expect(await automationStudioActionPermissionDenied(purchase)).toEqual({ permitted: false, missing: ["move_money"], requestId: null });
  });

  it("gates an action whose effect nobody stated, exactly as before", async () => {
    const run = gate();

    expect(await run.checkFor(STEP)(PUBLISH)).toEqual({ permitted: false, missing: ["send_or_publish", "create_new"], requestId: "permission-request:one" });
    expect(run.declarations[0]?.action.effect).toBe("mutate");
  });

  it("refuses a declaration whose effect is a word Core does not know", async () => {
    const run = gate();

    await expect(run.checkFor(PRESS)({ ...NOTHING_LASTING, effect: "observes" } as unknown as AutomationStudioActionDeclaration))
      .rejects.toThrow(/effect_invalid/u);
  });
});

describe("holding what was declared against what was instructed", () => {
  it("names the contradiction when the instruction asks and no action said so", () => {
    const check = automationStudioActionDeclarationCrossCheck({
      declarations: [
        { action: { kind: "exploration_step", id: "core.run_node", ref: "call.1", verb: "press", effect: "mutate" }, control: { name: "Schedule post", kind: "button" }, consequences: [], permitted: true },
        { action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s4", verb: "press", effect: "mutate" }, control: { name: null, kind: "button" }, consequences: [], permitted: true }
      ],
      instructed: [SCHEDULE]
    });

    expect(check.verdict).toBe("undeclared");
    expect(check.undeclared).toEqual(["send_or_publish"]);
    expect(check.declaredNothing).toBe(2);
    expect(check.quotes).toEqual([{ consequence: "send_or_publish", instructionId: "instruction.schedule", quote: "Schedule a post for Friday" }]);
    expect(check.sentence).toBe("The instruction asks for send_or_publish, and none of this run's 2 actions said it would cause that; 2 of them said they would cause nothing lasting.");
  });

  it("agrees when one action declared what the instruction asks for", () => {
    const check = automationStudioActionDeclarationCrossCheck({
      declarations: [
        { action: { kind: "exploration_step", id: "core.run_node", ref: "call.1", verb: "press", effect: "mutate" }, control: { name: null, kind: "button" }, consequences: [], permitted: true },
        { action: { kind: "exploration_step", id: "core.run_node", ref: "call.2", verb: "press", effect: "mutate" }, control: { name: "Schedule post", kind: "button" }, consequences: ["send_or_publish"], permitted: true }
      ],
      instructed: [SCHEDULE]
    });

    expect(check.verdict).toBe("agreed");
    expect(check.undeclared).toEqual([]);
    expect(check.declared).toEqual(["send_or_publish"]);
  });

  it("says so when an action declared something the instruction does not ask for", () => {
    const check = automationStudioActionDeclarationCrossCheck({
      declarations: [
        { action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s1", verb: "press", effect: "mutate" }, control: { name: "Delete", kind: "button" }, consequences: ["delete", "send_or_publish"], permitted: true }
      ],
      instructed: [SCHEDULE]
    });

    expect(check.verdict).toBe("beyond_instruction");
    expect(check.beyondInstruction).toEqual(["delete"]);
    expect(check.undeclared).toEqual([]);
  });

  it("reports the contradiction first when both directions disagree", () => {
    const check = automationStudioActionDeclarationCrossCheck({
      declarations: [
        { action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s1", verb: "press", effect: "mutate" }, control: { name: "Delete", kind: "button" }, consequences: ["delete"], permitted: true }
      ],
      instructed: [SCHEDULE]
    });

    expect(check.verdict).toBe("undeclared");
    expect(check.beyondInstruction).toEqual(["delete"]);
    expect(check.undeclared).toEqual(["send_or_publish"]);
  });

  it("calls a run that put nothing to the gate not comparable rather than a contradiction", () => {
    const check = automationStudioActionDeclarationCrossCheck({ declarations: [], instructed: [SCHEDULE] });

    expect(check.verdict).toBe("not_comparable");
    expect(check.undeclared).toEqual([]);
    expect(check.sentence).toBe("No action was put to the permission gate, so there is nothing to compare with the instruction.");
  });
});
