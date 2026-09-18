// The person's instruction as a grant: what it asks for, grounded in its own
// words, kept with the Flow, and lapsing when the words change.

import { describe, expect, it, vi } from "vitest";
import {
  AutomationStudioActionPermissionGate,
  automationStudioInstructionDigest,
  currentAutomationStudioInstructedConsequences,
  readAutomationStudioInstructedConsequences,
  type AutomationStudioActionDeclaration
} from "../index.ts";

const REFUND_INSTRUCTION = { instructionId: "instruction.refund", title: "Partial refund", body: "Find the order placed by Ada Lovelace, open it, refund the value of the first line on it." };
const REFUND: AutomationStudioActionDeclaration = { consequences: ["move_money", "modify_existing"], control: { name: "Refund line 1", kind: "button" }, verb: "press" };
const STEP = { kind: "flow_step" as const, id: "demo.orders.press", ref: "main.s3" };

describe("reading what an instruction asks for", () => {
  it("keeps a claim only where its quote is the person's own words", () => {
    const read = readAutomationStudioInstructedConsequences({
      instructions: [REFUND_INSTRUCTION],
      result: {
        instructed: [
          { consequence: "move_money", quote: "Refund  the value of the FIRST line on it." },
          { consequence: "modify_existing", quote: "refund the value of the first line" },
          { consequence: "delete", quote: "delete the order" },
          { consequence: "purchase", quote: "open it" },
          { consequence: "move_money", quote: "open it" }
        ]
      }
    });

    expect(read).toEqual([
      { consequence: "move_money", instructionId: "instruction.refund", instructionDigest: automationStudioInstructionDigest(REFUND_INSTRUCTION), quote: "Refund the value of the FIRST line on it." },
      { consequence: "modify_existing", instructionId: "instruction.refund", instructionDigest: automationStudioInstructionDigest(REFUND_INSTRUCTION), quote: "refund the value of the first line" }
    ]);
  });

  it("claims nothing from an answer it cannot read", () => {
    for (const result of [undefined, {}, { instructed: "move_money" }, { instructed: [{ consequence: "move_money" }] }]) {
      expect(readAutomationStudioInstructedConsequences({ instructions: [REFUND_INSTRUCTION], result })).toEqual([]);
    }
  });
});

describe("a gate that reads the instruction", () => {
  it("lets an instructed refund go ahead with no grant, and reads the instruction once", async () => {
    const derive = vi.fn(async () => readAutomationStudioInstructedConsequences({
      instructions: [REFUND_INSTRUCTION],
      result: { instructed: [{ consequence: "move_money", quote: "refund the value of the first line" }, { consequence: "modify_existing", quote: "refund the value of the first line" }] }
    }));
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed: derive });

    expect(await gate.checkFor(STEP)(REFUND)).toEqual({ permitted: true });
    expect(await gate.checkFor({ ...STEP, ref: "main.s4" })({ ...REFUND, control: { name: "Confirm refund" } })).toEqual({ permitted: true });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(gate.request).toBeUndefined();
    expect(gate.instructed?.map((entry) => entry.consequence)).toEqual(["move_money", "modify_existing"]);
  });

  it("asks for what the instruction did not ask for, saying what it did", async () => {
    const gate = new AutomationStudioActionPermissionGate({
      stage: "authoring",
      permittedConsequences: ["create_new"],
      deriveInstructed: async () => readAutomationStudioInstructedConsequences({ instructions: [REFUND_INSTRUCTION], result: { instructed: [{ consequence: "move_money", quote: "refund the value of the first line" }] } })
    });

    expect(await gate.checkFor(STEP)(REFUND)).toMatchObject({ permitted: false, missing: ["modify_existing"] });
    expect(gate.request?.authority).toEqual({
      granted: ["create_new"],
      instructed: [{ consequence: "move_money", instructionId: "instruction.refund", quote: "refund the value of the first line" }]
    });
  });

  it("asks when reading the instruction failed, rather than acting", async () => {
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed: async () => { throw new Error("provider down"); } });

    expect(await gate.checkFor(STEP)(REFUND)).toMatchObject({ permitted: false, missing: ["move_money", "modify_existing"] });
  });

  it("still reads the instruction once when a grant covers the action, so what it asks for is kept with the Flow", async () => {
    const derive = vi.fn(async () => []);
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", permittedConsequences: ["move_money", "modify_existing"], deriveInstructed: derive });

    expect(await gate.checkFor(STEP)(REFUND)).toEqual({ permitted: true });
    expect(derive).toHaveBeenCalledTimes(1);
  });
});

describe("the instructed set kept with a Flow", () => {
  const stored = readAutomationStudioInstructedConsequences({ instructions: [REFUND_INSTRUCTION], result: { instructed: [{ consequence: "move_money", quote: "refund the value of the first line" }] } });

  it("stands while the instruction is active and unchanged, with no model", async () => {
    const { current, lapsed } = currentAutomationStudioInstructedConsequences({ stored: JSON.parse(JSON.stringify(stored)), activeInstructions: [REFUND_INSTRUCTION] });

    expect(current).toEqual(stored);
    expect(lapsed).toEqual([]);
    const gate = new AutomationStudioActionPermissionGate({ stage: "recovery", instructed: current });
    expect(await gate.checkFor(STEP)({ ...REFUND, consequences: ["move_money"] })).toEqual({ permitted: true });
  });

  it("lapses when the instruction's words change or it is no longer active", () => {
    const edited = { ...REFUND_INSTRUCTION, body: `${REFUND_INSTRUCTION.body} Refund the second line too.` };

    expect(currentAutomationStudioInstructedConsequences({ stored, activeInstructions: [edited] })).toEqual({ current: [], lapsed: stored });
    expect(currentAutomationStudioInstructedConsequences({ stored, activeInstructions: [] })).toEqual({ current: [], lapsed: stored });
  });

  it("reads nothing it cannot parse as an entry", () => {
    const tampered = [{ ...stored[0], consequence: "purchase" }, { ...stored[0], instructionDigest: "md5:1" }, "move_money", { ...stored[0], extra: true }];

    expect(currentAutomationStudioInstructedConsequences({ stored: tampered, activeInstructions: [REFUND_INSTRUCTION] })).toEqual({ current: [], lapsed: [] });
  });
});
