// An action that undoes one of the build's own acts (t462): what the gate lets
// it do unasked, what it never does, and why such a record never becomes a
// finding against the person's instruction.
//
// The load-bearing property is the narrowness: `undoes.allowed` holds for the
// one action it rides on and never widens the run, so an act on anything that
// was there before the build is asked about exactly as before.

import { describe, expect, it } from "vitest";
import {
  AutomationStudioActionPermissionGate,
  automationStudioActionDeclarationCrossCheck,
  type AutomationStudioActionConsequence,
  type AutomationStudioActionDeclaration,
  type AutomationStudioActionDeclarationRecord
} from "../index.ts";

const REMOVE: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Remove", kind: "button" }, verb: "press" };
const UNDO = { kind: "exploration_step" as const, id: "demo.press", ref: "call.undo", undoes: { act: "act-1", allowed: ["delete" as const] } };

function gate(endsOnRequest?: boolean) {
  let next = 0;
  const built = new AutomationStudioActionPermissionGate({
    permittedConsequences: [],
    stage: "authoring",
    instructionIds: ["instruction.one"],
    endsOnRequest,
    now: () => 1,
    newRequestId: () => `permission-request:${++next}`
  });
  built.observe({ kind: "llm_evidence_tool_execution", evidence: { controls: [{ name: "Remove" }] }, effectApplied: false });
  return built;
}

describe("an action that undoes the build's own act", () => {
  it("may delete what the build created without asking, and records the act it undid", async () => {
    const run = gate();
    const verdict = await run.checkFor(UNDO)(REMOVE);

    expect(verdict).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.signal.aborted).toBe(false);
    expect(run.declarations).toEqual([{
      action: { kind: "exploration_step", id: "demo.press", ref: "call.undo", verb: "press", effect: "mutate" },
      control: { name: "Remove", kind: "button" },
      consequences: ["delete"],
      permitted: true,
      undoes: "act-1"
    }]);
  });

  it("never widens the run: the next delete, on anything else, is still asked about", async () => {
    const run = gate(false);
    await run.checkFor(UNDO)(REMOVE);
    const verdict = await run.checkFor({ kind: "exploration_step", id: "demo.press", ref: "call.next" })(REMOVE);

    expect(verdict).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:1" });
    expect(run.declarations[1]?.undoes).toBeUndefined();
  });

  it("still raises the request when undoing that act allows nothing gated", async () => {
    const run = gate();
    const verdict = await run.checkFor({ ...UNDO, undoes: { act: "act-2", allowed: [] } })(REMOVE);

    expect(verdict).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:1" });
    expect(run.request?.action).toEqual({ kind: "exploration_step", id: "demo.press", ref: "call.undo", verb: "press" });
    expect(run.declarations[0]).toMatchObject({ permitted: false, undoes: "act-2", requestId: "permission-request:1" });
  });

  it("asks about a class undoing it was not allowed, even beside one it was", async () => {
    const run = gate();
    const verdict = await run.checkFor(UNDO)({ ...REMOVE, consequences: ["delete", "move_money"] });

    expect(verdict).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1" });
  });

  it("lets a person's earlier no win over the undo's allowance", async () => {
    const run = gate(false);
    await run.checkFor({ kind: "exploration_step", id: "demo.press", ref: "call.first" })(REMOVE);
    run.settle("declined");
    const verdict = await run.checkFor(UNDO)(REMOVE);

    expect(verdict).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:1", declined: true });
  });

  it("allows no word Core does not recognise", async () => {
    const run = gate();
    const verdict = await run.checkFor({ ...UNDO, undoes: { act: "act-1", allowed: ["anything"] as unknown as readonly AutomationStudioActionConsequence[] } })(REMOVE);

    expect(verdict.permitted).toBe(false);
  });
});

describe("the cross-check and the build's undos", () => {
  const record = (consequences: AutomationStudioActionDeclarationRecord["consequences"], undoes?: string): AutomationStudioActionDeclarationRecord => {
    const entry: AutomationStudioActionDeclarationRecord = {
      action: { kind: "exploration_step", id: "demo.press", ref: `call.${consequences.join("-")}`, verb: "press", effect: "mutate" },
      control: { name: "Remove", kind: "button" },
      consequences,
      permitted: true
    };
    if (undoes) entry.undoes = undoes;
    return entry;
  };
  const instructed = [{ consequence: "create_new" as const, instructionId: "instruction.one", instructionDigest: "digest.one", quote: "add it to my list" }];

  it("leaves undo records out, so a reset is never a finding beyond the instruction", () => {
    const crossCheck = automationStudioActionDeclarationCrossCheck({ declarations: [record(["create_new"]), record(["delete"], "act-1")], instructed });

    expect(crossCheck.verdict).toBe("agreed");
    expect(crossCheck.declared).toEqual(["create_new"]);
    expect(crossCheck.beyondInstruction).toEqual([]);
    expect(crossCheck.actions).toBe(1);
  });

  it("has nothing to compare when every action was an undo", () => {
    const crossCheck = automationStudioActionDeclarationCrossCheck({ declarations: [record(["delete"], "act-1")], instructed });

    expect(crossCheck.verdict).toBe("not_comparable");
    expect(crossCheck.undeclared).toEqual([]);
  });
});
