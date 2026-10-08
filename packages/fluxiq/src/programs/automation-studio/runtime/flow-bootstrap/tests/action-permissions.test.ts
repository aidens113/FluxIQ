// How a build puts its permission questions to a person, answer by answer.
//
// The build used to ask once and only once, whatever came back: `asked` was
// set at the first question, so after a person said no to one press every
// later gated action was refused with that first request and nobody was asked
// again. Live, a `move_money` declared on "Continue to checkout" was declined,
// and "Place order" -- the press the task needed -- could then never be asked
// about (t195-w18). These drive `automationStudioFlowBootstrapActionPermissions`
// with a stand-in domain and a parking port that answers as scripted.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration, AutomationStudioActionPermissionVerdict, AutomationStudioInstructedConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapUnansweredSaid } from "../action-permissions.ts";
import { automationStudioInstructedActs } from "../instructed-acts/index.ts";

const CHECKOUT: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Continue to checkout", kind: "button" }, verb: "press" };
const PLACE: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Place order", kind: "button" }, verb: "press" };

type Answer = "grant" | "deny" | undefined;

/** A thread that answers each question it is asked with the next scripted answer, and remembers what it was asked. */
function thread(answers: Answer[]) {
  const opened: AutomationStudioAsk[] = [];
  const waited: string[] = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask) => {
      waited.push(ask.askId);
      const kind = answers.shift();
      return kind === undefined ? undefined : ({ askId: ask.askId, answeredAt: 1, kind, value: null, actorId: "person" } satisfies AutomationStudioAskAnswer);
    }
  };
  return { port, opened, waited };
}

/** One build's gate, with every press the stand-in domain is asked to make declaring what the call says. */
function build(answers: Answer[]) {
  const asks = thread(answers);
  const verdicts: AutomationStudioActionPermissionVerdict[] = [];
  let next = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.order"],
    newRequestId: () => `permission-request:${++next}`,
    ask: { port: asks.port, timeoutMs: 1_000 },
    executeTool: async (call) => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      verdicts.push(verdict);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = (callId: string, declaration: AutomationStudioActionDeclaration) =>
    permissions.executeTool({ callId, toolId: "example.press", value: { declaration } as unknown as JsonObject });
  return { permissions, asks, verdicts, press };
}

describe("a build's permission questions after a person says no", () => {
  it("asks about a different control once the first was declined, and a grant there lets it go ahead", async () => {
    const run = build(["deny", "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);

    expect(run.asks.waited).toEqual(["permission-request:1", "permission-request:2"]);
    expect(run.verdicts).toEqual([
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true },
      { permitted: true }
    ]);
    // Granted, nothing is left for the proposal to carry.
    expect(run.permissions.request()).toBeUndefined();
  });

  it("refuses the declined control again without asking, naming the request the person declined", async () => {
    const run = build(["deny", "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);
    await run.press("call.checkout.again", CHECKOUT);

    expect(run.asks.opened.map((ask) => ask.askId)).toEqual(["permission-request:1", "permission-request:2"]);
    expect(run.verdicts.at(-1)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    // Answered, so the build does not stand on it while exploring: a stalled
    // round is not ended as that question, and a Flow without the control
    // stays approvable. A plan step that needs it puts it back.
    expect(run.permissions.request()).toBeUndefined();
    const step = await run.permissions.planStep({ definitionId: "example.press", ref: "main.checkout" })(CHECKOUT);
    expect(step).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    expect(run.asks.opened).toHaveLength(2);
    expect(run.permissions.request()?.requestId).toBe("permission-request:1");
    expect(run.permissions.signal.aborted).toBe(true);
  });

  it("waits once when nobody answers, and refuses everything after it with that request", async () => {
    const run = build([undefined, "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);

    expect(run.asks.waited).toEqual(["permission-request:1"]);
    expect(run.verdicts).toEqual([
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1" },
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1" }
    ]);
  });

  it("ends the build on the request that refused its plan step", async () => {
    // Declined on one control, then a plan step on another, asked and declined too.
    const declinedTwice = build(["deny", "deny"]);
    await declinedTwice.press("call.checkout", CHECKOUT);
    const place = await declinedTwice.permissions.planStep({ definitionId: "example.press", ref: "main.place" })(PLACE);
    expect(place).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:2", declined: true });
    expect(declinedTwice.permissions.signal.aborted).toBe(true);
    expect(declinedTwice.permissions.endedOnRequest()?.diagnostic.permissionRequest).toMatchObject({ requestId: "permission-request:2", action: { kind: "flow_step", ref: "main.place" } });

    // A plan step that repeats the declined question ends on the declined request, unasked.
    const repeated = build(["deny", "grant"]);
    await repeated.press("call.checkout", CHECKOUT);
    await repeated.press("call.place", PLACE);
    const checkout = await repeated.permissions.planStep({ definitionId: "example.press", ref: "main.checkout" })(CHECKOUT);
    expect(checkout).toMatchObject({ permitted: false, requestId: "permission-request:1", declined: true });
    expect(repeated.asks.waited).toHaveLength(2);
    expect(repeated.permissions.endedOnRequest()?.diagnostic.permissionRequest).toMatchObject({ requestId: "permission-request:1", action: { kind: "exploration_step", ref: "call.checkout" } });
  });
});

/**
 * What the build says in the thread when the instruction asks for something no
 * action declared (F42). Only money, delete and send/publish are put to the
 * person as a question (`../../action-permissions/destructive.ts`); a creation
 * or an edit is said without a question where the thread takes plain words, and
 * not at all where it only takes questions. Never a pause: nothing parks.
 */
describe("the cross-check, said in the person's words", () => {
  const NOTHING: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Add to cart", kind: "button" }, verb: "press" };
  const DIGEST = `sha256:${"0".repeat(64)}`;
  const CART: AutomationStudioInstructedConsequence[] = [
    { consequence: "create_new", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "add it to the cart" },
    { consequence: "modify_existing", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "choose Space Grey" }
  ];
  const ORDER: AutomationStudioInstructedConsequence[] = [
    ...CART,
    { consequence: "move_money", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "place the order" }
  ];

  function crossChecked(instructed: AutomationStudioInstructedConsequence[], withSay: boolean) {
    const asks = thread([]);
    const said: string[] = [];
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: ["instruction.cart"],
      deriveInstructed: async () => instructed,
      ask: { port: asks.port, timeoutMs: 1_000 },
      ...(withSay ? { say: async (text: string) => { said.push(text); } } : {}),
      executeTool: async (call) => {
        const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
        return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    return { permissions, asks, said };
  }

  async function pressThreeTimes(run: ReturnType<typeof crossChecked>) {
    for (const callId of ["call.1", "call.2", "call.3"]) await run.permissions.executeTool({ callId, toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    return await run.permissions.crossCheck();
  }

  it("says a creation or an edit nobody declared without asking anything", async () => {
    const run = crossChecked(CART, true);
    const check = await pressThreeTimes(run);

    expect(check?.verdict).toBe("undeclared");
    expect(run.asks.opened).toEqual([]);
    expect(run.said).toEqual(["Your instruction asks to change something that exists (\"choose Space Grey\") and create something new (\"add it to the cart\"), but nothing FluxIQ did while building this Flow said it would."]);
  });

  it("says nothing at all where the thread only takes questions, and still records the finding", async () => {
    const run = crossChecked(CART, false);
    const check = await pressThreeTimes(run);

    expect(check?.undeclared).toEqual(["modify_existing", "create_new"]);
    expect(check?.quotes.map((quote) => quote.quote)).toEqual(["choose Space Grey", "add it to the cart"]);
    expect(run.asks.opened).toEqual([]);
    expect(run.said).toEqual([]);
  });

  it("asks yes or no, without pausing, when money, a delete or a send went undeclared", async () => {
    const run = crossChecked(ORDER, true);
    await pressThreeTimes(run);

    expect(run.said).toEqual([]);
    expect(run.asks.opened).toHaveLength(1);
    expect(run.asks.waited).toEqual([]);
    expect(run.asks.opened[0]).toMatchObject({ kind: "confirm", parks: false, consequences: ["move_money", "modify_existing", "create_new"] });
    expect(run.asks.opened[0]!.text).toBe("Your instruction asks to move money (\"place the order\"), change something that exists (\"choose Space Grey\") and create something new (\"add it to the cart\"), but nothing FluxIQ did while building this Flow said it would. Apply it as it stands?");
    expect(run.asks.opened[0]!.text).not.toMatch(/move_money|modify_existing|create_new|\d+ action/u);
  });
});

/**
 * Which of the instruction's acts it asks to last, read before the build's
 * first test so the test does not repeat them (t174-w83). Run
 * `run-murwd8le-79e735a8` (Cause 3) read the instruction only after the build,
 * from the cross-check (0070), so its Add to cart -- declared `[]` -- was
 * pressed again by both tests (0045, 0068). The quotes are that run's.
 */
describe("the instruction's lasting acts, read once before the first test", () => {
  const DIGEST = `sha256:${"0".repeat(64)}`;
  const READ: AutomationStudioInstructedConsequence[] = [
    { consequence: "create_new", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart" },
    { consequence: "modify_existing", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "Collect that store's coupon while you are on the item" }
  ];
  const ACTS = [
    { id: "a1", quote: "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain" },
    { id: "a2", quote: "Collect that store's coupon while you are on the item" }
  ];
  const NOTHING: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Add to cart", kind: "button" }, verb: "press" };

  function reading(instructed: readonly AutomationStudioInstructedConsequence[] | Error) {
    let derived = 0;
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: ["instruction.goal"],
      deriveInstructed: async () => {
        derived += 1;
        if (instructed instanceof Error) throw instructed;
        return instructed;
      },
      executeTool: async (call) => {
        const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
        return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    return { permissions, derived: () => derived };
  }

  it("names every act whose words one of the read's quotes contains, or is contained in", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs(ACTS)].sort()).toEqual(["a1", "a2"]);
  });

  it("names both acts Core reads from that run's own instruction", async () => {
    const instruction = "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything.";
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.map((act) => act.id)).toEqual(["a1", "a2"]);
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs(acts)].sort()).toEqual(["a1", "a2"]);
  });

  it("matches across case and spacing, and leaves out an act no quote overlaps", async () => {
    const run = reading(READ);
    const acts = [
      { id: "a1", quote: "PUT three of the  Voltbay USB-C hub\nsold by Voltbay Official Store in my cart" },
      { id: "a2", quote: "open my saved items" }
    ];
    expect([...await run.permissions.instructedLastingActs(acts)]).toEqual(["a1"]);
  });

  it("never names a choice of an act, which the steps after it stand on", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs([{ id: "a1.colour", quote: ACTS[0]!.quote }])]).toEqual([]);
  });

  it("reads the instruction once: the cross-check after the build reuses it, and no second call is made", async () => {
    const run = reading(READ);
    await run.permissions.instructedLastingActs(ACTS);
    expect(run.derived()).toBe(1);
    // The order `permission-outcome.ts` keeps: what the instruction asks for is known before the build ends, and stays the same after the cross-check.
    expect(run.permissions.instructed()).toEqual(READ);
    await run.permissions.executeTool({ callId: "call.add", toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    const check = await run.permissions.crossCheck();
    expect(check?.verdict).toBe("undeclared");
    expect(check?.undeclared).toEqual(["modify_existing", "create_new"]);
    expect(run.derived()).toBe(1);
    expect(run.permissions.instructed()).toEqual(READ);
  });

  it("makes no call for an instruction with no acts", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs([])]).toEqual([]);
    expect(run.derived()).toBe(0);
  });

  it("grounds split objects in the original combined clause without classifying an unquoted sibling", async () => {
    const instruction = "Switch my pickup store to Example Store, then add two packs of Towels in Large and one pack of Napkins in Small to my cart, both for pickup. Do not buy anything.";
    const kinded = automationStudioInstructedActs(instruction);
    // Both adds last by their kind whatever the read quoted (lane B, F1), so grounding alone is shown on kind-less copies.
    expect([...await reading([{ ...READ[0]!, quote: "add" }]).permissions.instructedLastingActs(kinded)].sort()).toEqual(["a2", "a3"]);
    const acts = kinded.map((act) => ({ id: act.id, quote: act.quote, ...(act.source ? { source: act.source } : {}) }));
    const combined = reading([{ ...READ[0]!, quote: "add two packs of Towels in Large and one pack of Napkins in Small to my cart" }]);
    expect([...await combined.permissions.instructedLastingActs(acts)]).toEqual(["a2", "a3"]);
    await combined.permissions.instructedLastingActs(acts);
    expect(combined.derived()).toBe(1);
    const narrow = reading([{ ...READ[0]!, quote: "one pack of Napkins in Small to my cart" }]);
    expect([...await narrow.permissions.instructedLastingActs(acts)]).toEqual(["a3"]);
    const sharedVerb = reading([{ ...READ[0]!, quote: "add" }]);
    expect([...await sharedVerb.permissions.instructedLastingActs(acts)]).toEqual([]);
    const unrelated = reading([{ ...READ[0]!, quote: "add two packs of Unrelated to my cart" }]);
    expect([...await unrelated.permissions.instructedLastingActs(acts)]).toEqual([]);
  });

  it("names nothing by quote when the read fails, and does not try again at the cross-check", async () => {
    const run = reading(new Error("provider down"));
    expect([...await run.permissions.instructedLastingActs(ACTS)]).toEqual([]);
    await run.permissions.executeTool({ callId: "call.add", toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    await run.permissions.crossCheck();
    expect(run.derived()).toBe(1);
  });

  /**
   * Run `run-musp4h2f-72e8ed99` (lane B): Core split the coordinated objects
   * into a2 and a3, each quote composed from the verb and its own object, and
   * the read quoted the whole coordinated sentence. Neither quote contained the
   * other, so neither add was lasting, the Add to cart steps -- declared `[]` --
   * were pressed again by all four tests, and the cart grew from 1 to 12 items.
   * An add is lasting by its kind, whatever the read quoted.
   */
  describe("an act whose kind lasts, whatever the read quoted", () => {
    const RUN_B = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
    const RUN_B_READ: AutomationStudioInstructedConsequence[] = [
      { consequence: "modify_existing", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "Switch my pickup store to Millbrook Crossing Supercenter" },
      { consequence: "create_new", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart" }
    ];

    it("names both split adds of that run's instruction, and the store switch the read quoted", async () => {
      const acts = automationStudioInstructedActs(RUN_B);
      expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "set"], ["a2", "add_to"], ["a3", "add_to"]]);
      const run = reading(RUN_B_READ);
      expect([...await run.permissions.instructedLastingActs(acts)].sort()).toEqual(["a1", "a2", "a3"]);
    });

    it("leaves out an open the read does not quote, and never names a choice", async () => {
      const acts = [...automationStudioInstructedActs(RUN_B), { id: "a4", kind: "open" as const, quote: "open my saved items" }, { id: "a2.quantity", kind: "add_to" as const, quote: "two packs" }];
      const run = reading(RUN_B_READ);
      const lasting = await run.permissions.instructedLastingActs(acts);
      expect(lasting.has("a4")).toBe(false);
      expect(lasting.has("a2.quantity")).toBe(false);
    });

    it("still names the lasting kinds when the read fails, and only those", async () => {
      const run = reading(new Error("provider down"));
      expect([...await run.permissions.instructedLastingActs(automationStudioInstructedActs(RUN_B))].sort()).toEqual(["a2", "a3"]);
    });
  });
});

// W25 of the week review (run-mux6n7m4-8273e7a0, moment 4): the thread quoted "...in my cart: Space
// Grey, the 7-in-1 version, shipped f...", an act's words cut inside a word. A long quote is cut
// where a word ends, never inside one.
describe("the line that names the acts the read gave no answer for", () => {
  const LONG = "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain";

  it("cuts a long quote where a word ends, and leaves a short one whole", () => {
    const said = automationStudioFlowBootstrapUnansweredSaid([LONG, "Collect that store's coupon while you are on the item"]);
    const quoted = /^I could not tell from your instruction whether "([^"]+)…", "Collect that store's coupon while you are on the item" change something that stays changed, so when the build tests its steps it checks the steps that do them rather than doing them again\.$/u.exec(said);
    expect(quoted, said).not.toBeNull();
    const kept = quoted![1]!;
    expect(LONG.startsWith(kept)).toBe(true);
    expect(LONG.charAt(kept.length)).toBe(" ");
    expect(kept.length).toBeLessThanOrEqual(120);
    expect(automationStudioFlowBootstrapUnansweredSaid(["add the towels"])).toBe("I could not tell from your instruction whether \"add the towels\" changes something that stays changed, so when the build tests its steps it checks the step that does it rather than doing it again.");
    // t370 (lane A rounds 6 and 7 UI): the old words, "Reading your instruction gave no answer for ...", are gone.
    expect(automationStudioFlowBootstrapUnansweredSaid(["add the towels"])).not.toContain("gave no answer");
  });
});
