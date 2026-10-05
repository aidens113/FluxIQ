// The person's instruction as a permission: what it asks for, grounded in its own
// words, kept with the Flow, and lapsing when the words change.

import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA,
  AutomationStudioActionPermissionGate,
  automationStudioInstructedActReads,
  automationStudioInstructedConsequencesSchema,
  automationStudioInstructedReadUnanswered,
  automationStudioInstructionDigest,
  currentAutomationStudioInstructedConsequences,
  readAutomationStudioInstructedConsequences,
  readAutomationStudioInstructedRead,
  type AutomationStudioActionDeclaration
} from "../index.ts";

const REFUND_INSTRUCTION = { instructionId: "instruction.refund", title: "Partial refund", body: "Find the order placed by Ada Lovelace, open it, refund the value of the first line on it." };
const REFUND: AutomationStudioActionDeclaration = { consequences: ["move_money", "modify_existing"], control: { name: "Refund line 1", kind: "button" }, verb: "press" };
/**
 * The refund the instruction asks for, and a deletion it says nothing about.
 * `modify_existing` cannot play that part since 2026-09-26: the instruction
 * covers the money, and an edit is no longer a class anybody is asked about, so
 * a class beyond the instruction has to be one that still is.
 */
const REFUND_AND_REMOVE: AutomationStudioActionDeclaration = { consequences: ["move_money", "delete"], control: { name: "Remove line 1", kind: "button" }, verb: "press" };
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
  // Until 2026-09-30 an instructed refund went ahead unasked. The user's rule
  // (`docs/working/mvp-today-plan.md:150`) makes moving money need a person's
  // authority independently of the instruction, so it asks, and says what the
  // instruction asked for.
  it("asks before an instructed refund with nothing permitted, reads the instruction once, and records it", async () => {
    const derive = vi.fn(async () => readAutomationStudioInstructedConsequences({
      instructions: [REFUND_INSTRUCTION],
      result: { instructed: [{ consequence: "move_money", quote: "refund the value of the first line" }, { consequence: "modify_existing", quote: "refund the value of the first line" }] }
    }));
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed: derive });

    expect(await gate.checkFor(STEP)(REFUND)).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(await gate.checkFor({ ...STEP, ref: "main.s4" })({ ...REFUND, control: { name: "Confirm refund" } })).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(gate.request?.authority.instructed.map((entry) => entry.consequence)).toEqual(["move_money", "modify_existing"]);
    expect(gate.instructed?.map((entry) => entry.consequence)).toEqual(["move_money", "modify_existing"]);
  });

  it("asks for every gated class the action declares, whether or not the instruction asked for it, saying what it did", async () => {
    const gate = new AutomationStudioActionPermissionGate({
      stage: "authoring",
      permittedConsequences: ["create_new"],
      deriveInstructed: async () => readAutomationStudioInstructedConsequences({ instructions: [REFUND_INSTRUCTION], result: { instructed: [{ consequence: "move_money", quote: "refund the value of the first line" }] } })
    });

    expect(await gate.checkFor(STEP)(REFUND_AND_REMOVE)).toMatchObject({ permitted: false, missing: ["move_money", "delete"] });
    expect(gate.request?.consequences).toEqual(["move_money", "delete"]);
    expect(gate.request?.authority).toEqual({
      granted: ["create_new"],
      instructed: [{ consequence: "move_money", instructionId: "instruction.refund", quote: "refund the value of the first line" }]
    });
  });

  it("asks when reading the instruction failed, rather than acting", async () => {
    const gate = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed: async () => { throw new Error("provider down"); } });

    expect(await gate.checkFor(STEP)(REFUND)).toMatchObject({ permitted: false, missing: ["move_money"] });
  });

  it("still reads the instruction once when a person's permission covers the action, so what it asks for is kept with the Flow", async () => {
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
    // Kept and read back, not a permission: a stored instruction still asks
    // before moving money, and the question carries it.
    const gate = new AutomationStudioActionPermissionGate({ stage: "recovery", instructed: current });
    expect(await gate.checkFor(STEP)({ ...REFUND, consequences: ["move_money"] })).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(gate.request?.authority.instructed.map((entry) => entry.consequence)).toEqual(["move_money"]);
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

/**
 * One answer per act (t174-w107, run `run-musp8nz1-dbd3905a` Cause 5): that
 * run's read answered the cart and not the coupon, and a second act of a class
 * already given could not have been kept anyway.
 */
describe("reading what each act of an instruction asks for", () => {
  const SHOP = { instructionId: "instruction.shop", title: "Hub", body: "Put two hubs in my cart. Collect that store's coupon while you are on the item. Open my saved items." };
  const ACTS = [
    { id: "a1", quote: "Put two hubs in my cart" },
    { id: "a2", quote: "Collect that store's coupon while you are on the item" },
    { id: "a3", quote: "Open my saved items" }
  ];

  it("asks the question as it always was for an instruction with no acts", () => {
    expect(automationStudioInstructedConsequencesSchema([])).toBe(AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA);
  });

  it("asks for every act by id, the acts before the free answer", () => {
    const schema = automationStudioInstructedConsequencesSchema(ACTS) as { required: string[]; properties: Record<string, { required?: string[]; properties?: Record<string, { items: { enum: string[] } }> }> };
    expect(schema.required).toEqual(["acts", "instructed"]);
    expect(Object.keys(schema.properties)).toEqual(["acts", "instructed"]);
    expect(schema.properties.acts!.required).toEqual(["a1", "a2", "a3"]);
    expect(schema.properties.acts!.properties!.a2!.items.enum).toContain("none");
  });

  it("keeps an entry per act for one class, an act's none, and an act it skipped as unanswered", () => {
    const read = readAutomationStudioInstructedRead({ instructions: [SHOP], acts: ACTS, result: { acts: { a1: ["create_new"], a3: ["none"] }, instructed: [] } });
    expect(read.map((entry) => [entry.consequence, entry.quote])).toEqual([["create_new", "Put two hubs in my cart"]]);
    expect(automationStudioInstructedActReads(read)).toEqual([
      { act: "a1", quote: "Put two hubs in my cart", consequences: ["create_new"] },
      { act: "a2", quote: "Collect that store's coupon while you are on the item", consequences: null },
      { act: "a3", quote: "Open my saved items", consequences: [] }
    ]);
  });

  it("keeps two acts of one class as two entries, and the free answer's own entry once", () => {
    const read = readAutomationStudioInstructedRead({ instructions: [SHOP], acts: ACTS, result: { acts: { a1: ["create_new"], a2: ["create_new", "modify_existing"], a3: ["none"] }, instructed: [{ consequence: "create_new", quote: "two hubs in my cart" }] } });
    expect(read.map((entry) => [entry.consequence, entry.quote])).toEqual([
      ["modify_existing", "Collect that store's coupon while you are on the item"],
      ["create_new", "two hubs in my cart"],
      ["create_new", "Collect that store's coupon while you are on the item"]
    ]);
  });

  it("answers no act from a reply without acts, or one the reader cannot read", () => {
    for (const result of [undefined, {}, { instructed: [] }, { acts: "create_new" }, { acts: { a1: "lots", a2: [7], a3: ["purchase"] } }]) {
      expect(automationStudioInstructedActReads(readAutomationStudioInstructedRead({ instructions: [SHOP], acts: ACTS, result }))?.map((act) => act.consequences)).toEqual([null, null, null]);
    }
    expect(automationStudioInstructedActReads(automationStudioInstructedReadUnanswered(ACTS))?.map((act) => act.consequences)).toEqual([null, null, null]);
  });

  it("grounds a split act in the clause it came from, one entry per class for its siblings", () => {
    const CART = { instructionId: "instruction.cart", title: "Cart", body: "Add two packs of Towels in Large and one pack of Napkins in Small to my cart. Open my saved items." };
    const clause = "Add two packs of Towels in Large and one pack of Napkins in Small to my cart";
    const split = [
      { id: "a1", quote: "Add two packs of Towels in Large to my cart", source: { clause, object: "two packs of Towels in Large" } },
      { id: "a2", quote: "Add one pack of Napkins in Small to my cart", source: { clause, object: "one pack of Napkins in Small" } },
      { id: "a3", quote: "Open my saved items" }
    ];
    const read = readAutomationStudioInstructedRead({ instructions: [CART], acts: split, result: { acts: { a1: ["create_new"], a2: ["create_new", "modify_existing"], a3: ["none"] }, instructed: [] } });
    expect(read.map((entry) => [entry.consequence, entry.quote])).toEqual([["modify_existing", clause], ["create_new", clause]]);
    // The answers stay under each act's own words, which is what the build's tests compare.
    expect(automationStudioInstructedActReads(read)?.map((act) => [act.act, act.quote, act.consequences])).toEqual([
      ["a1", "Add two packs of Towels in Large to my cart", ["create_new"]],
      ["a2", "Add one pack of Napkins in Small to my cart", ["modify_existing", "create_new"]],
      ["a3", "Open my saved items", []]
    ]);
    // A split act whose clause is not the person's words claims nothing.
    const elsewhere = readAutomationStudioInstructedRead({ instructions: [CART], acts: [{ ...split[0]!, source: { clause: "Add towels and napkins to my basket", object: "towels" } }], result: { acts: { a1: ["create_new"] }, instructed: [] } });
    expect([...elsewhere]).toEqual([]);
  });

  it("stores and compares as the four-field entries alone", () => {
    const read = readAutomationStudioInstructedRead({ instructions: [SHOP], acts: ACTS, result: { acts: { a1: ["create_new"], a2: ["create_new"], a3: ["none"] }, instructed: [] } });
    const stored = JSON.parse(JSON.stringify(read)) as unknown[];
    expect(stored).toHaveLength(2);
    expect(Object.keys(stored[0] as object).sort()).toEqual(["consequence", "instructionDigest", "instructionId", "quote"]);
    expect(currentAutomationStudioInstructedConsequences({ stored, activeInstructions: [SHOP] }).current).toEqual([...read]);
    expect(automationStudioInstructedActReads([...read])).toBeUndefined();
  });
});
