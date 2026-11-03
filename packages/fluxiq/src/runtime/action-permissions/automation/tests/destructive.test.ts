// Which acts need a person, and which the instruction alone settles.
//
// Two properties, kept in one file so neither can be relaxed without the other
// being read. A run told to add something to a basket, save a listing for later
// or edit a record does it without asking (the product lost days to asking about
// ordinary work). And moving money, deleting, and sending or publishing are asked
// about every time, even when the instruction asked for them -- the user's rule,
// `docs/working/mvp-today-plan.md:150`, restored on 2026-09-30 -- with a question
// that carries everything the person needs to answer it.

import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCES,
  AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES,
  AutomationStudioActionPermissionGate,
  automationStudioActionDeclarationCrossCheck,
  automationStudioActionPermissionDenied,
  automationStudioDestructiveConsequences,
  isAutomationStudioDestructiveActionConsequence,
  parseAutomationStudioActionPermissionRequest,
  readAutomationStudioInstructedConsequences,
  type AutomationStudioActionDeclaration,
  type AutomationStudioInstructedConsequence
} from "../index.ts";

const BASKET = {
  instructionId: "instruction.basket",
  title: "Two lamps and a rug",
  body: "Find the two cheapest brass desk lamps, add both to the basket, save the striped rug for later, and send the seller a message asking when it ships. Do not check out, and leave my saved address alone."
};

const ADD_TO_BASKET: AutomationStudioActionDeclaration = { consequences: ["create_new"], control: { name: "Add to basket", kind: "button" }, verb: "press" };
const SEND_MESSAGE: AutomationStudioActionDeclaration = { consequences: ["send_or_publish", "create_new"], control: { name: "Send message", kind: "button" }, verb: "press" };
const CHECK_OUT: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Place order", kind: "button" }, verb: "press" };
const SAVE_ADDRESS: AutomationStudioActionDeclaration = { consequences: ["modify_existing", "create_new"], control: { name: "Save address", kind: "button" }, verb: "press" };
/** Destructive and editing at once, which is what tells the two apart in a request. */
const EMPTY_BASKET: AutomationStudioActionDeclaration = { consequences: ["delete", "modify_existing"], control: { name: "Empty basket", kind: "button" }, verb: "press" };

const PRESS = { kind: "exploration_step" as const, id: "core.run_node", ref: "call.3" };
const STEP = { kind: "flow_step" as const, id: "web.output.dom-click", ref: "main.s4" };

/** What a model reading `BASKET` answers when it reads it well: the two classes its words ask for. */
function readWell(): AutomationStudioInstructedConsequence[] {
  return readAutomationStudioInstructedConsequences({
    instructions: [BASKET],
    result: {
      instructed: [
        { consequence: "create_new", quote: "add both to the basket" },
        { consequence: "send_or_publish", quote: "send the seller a message asking when it ships" }
      ]
    }
  });
}

function gate(input: { permitted?: readonly string[]; derive?: () => Promise<readonly AutomationStudioInstructedConsequence[]> } = {}) {
  const built = new AutomationStudioActionPermissionGate({
    permittedConsequences: input.permitted,
    stage: "authoring",
    instructionIds: [BASKET.instructionId],
    deriveInstructed: input.derive,
    now: () => 1_789_000_000_000,
    newRequestId: () => "permission-request:one"
  });
  built.observe({
    kind: "llm_evidence_tool_execution",
    evidence: { controls: ["Add to basket", "Send message", "Place order", "Save address", "Empty basket"] },
    effectApplied: false
  });
  return built;
}

describe("which classes a person is still asked about", () => {
  // These rows name the list in full rather than probing one class, so a change
  // to `DESTROYS` is a failing test and never a surprise on a live run.
  //
  // `modify_existing` left on 2026-09-26 because gating it asked about ordinary
  // editing. `send_or_publish` left on 2026-09-28 and came back on 2026-09-30:
  // the user's rule names it beside money and deletion, and a message nobody
  // asked for was otherwise sent without asking (lane t195).
  it("is exactly money movement, deletion, and sending or publishing", () => {
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toEqual(["move_money", "delete", "send_or_publish"]);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => !isAutomationStudioDestructiveActionConsequence(consequence)))
      .toEqual(["modify_existing", "create_new"]);
    expect(isAutomationStudioDestructiveActionConsequence("send_or_publish")).toBe(true);
    expect(isAutomationStudioDestructiveActionConsequence("modify_existing")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence("create_new")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence("purchase")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence(undefined)).toBe(false);
  });

  // The counted form of the same rule, so re-gating a class fails here too
  // however it is reintroduced.
  it("gates three of the five classes and leaves two ungated", () => {
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toHaveLength(5);
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toHaveLength(3);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter(isAutomationStudioDestructiveActionConsequence)).toHaveLength(3);
  });

  it("keeps Core's order, drops repeats, and drops ordinary creating and editing", () => {
    expect(automationStudioDestructiveConsequences(["create_new", "delete", "move_money", "delete", "send_or_publish"]))
      .toEqual(["move_money", "delete", "send_or_publish"]);
    expect(automationStudioDestructiveConsequences(["create_new", "modify_existing"])).toEqual([]);
  });
});

describe("an act the person's instruction plainly asks for", () => {
  it("adds to the basket with nothing permitted and asks nobody, but asks before sending the message it asked for", async () => {
    const run = gate({ derive: async () => readWell() });

    expect(await run.checkFor(PRESS)(ADD_TO_BASKET)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: "permission-request:one" });
    expect(run.request?.authority.instructed.map((entry) => entry.consequence)).toContain("send_or_publish");
    expect(run.signal.aborted).toBe(true);
  });

  it("sends the message once a person has permitted sending", async () => {
    const run = gate({ permitted: ["send_or_publish"], derive: async () => readWell() });

    expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
  });

  it("is still recorded in full", async () => {
    const run = gate({ permitted: ["send_or_publish"], derive: async () => readWell() });
    await run.checkFor(STEP)(SEND_MESSAGE);

    expect(run.declarations[0]).toEqual({
      action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s4", verb: "press", effect: "mutate" },
      control: { name: "Send message", kind: "button" },
      consequences: ["send_or_publish", "create_new"],
      permitted: true
    });
  });

  // The same answer however the instruction was read: whether the derivation
  // named the class, found nothing, or failed, only a person's permission lets a
  // send through. Until 2026-09-30 an instructed class went ahead unasked, so
  // the answer depended on how the model happened to read the instruction.
  it("asks before sending however the instruction's authority was derived, and never before adding", async () => {
    const readIt = gate({ derive: async () => readWell() });
    const claimedNothing = gate({ derive: async () => readAutomationStudioInstructedConsequences({ instructions: [BASKET], result: { instructed: [] } }) });
    const providerDown = gate({ derive: async () => { throw new Error("provider down"); } });
    const noDerivation = gate();

    for (const run of [readIt, claimedNothing, providerDown, noDerivation]) {
      expect(await run.checkFor(PRESS)(ADD_TO_BASKET)).toEqual({ permitted: true });
      expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: "permission-request:one" });
    }
  });

  it("creates with no run behind it, and refuses to send, since no person could have permitted it", async () => {
    expect(await automationStudioActionPermissionDenied(ADD_TO_BASKET)).toEqual({ permitted: true });
    expect(await automationStudioActionPermissionDenied(SEND_MESSAGE)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
  });
});

describe("a destructive act the instruction did not ask for", () => {
  it("still stops the run and raises a request the person can answer", async () => {
    const derive = vi.fn(async () => readWell());
    const run = gate({ derive });

    expect(await run.checkFor(STEP)(CHECK_OUT)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:one" });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(run.raisedDuring("main.s4")).toBe(true);
    expect(run.signal.aborted).toBe(true);
    expect(run.request).toEqual({
      schemaVersion: "automation-studio.action-permission-request.v1",
      requestId: "permission-request:one",
      requestedAtMs: 1_789_000_000_000,
      action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s4", verb: "press" },
      control: { name: "Place order", kind: "button" },
      consequences: ["move_money"],
      missing: ["move_money"],
      reason: { stage: "authoring", instructionIds: ["instruction.basket"] },
      authority: {
        granted: [],
        instructed: [
          { consequence: "send_or_publish", instructionId: "instruction.basket", quote: "send the seller a message asking when it ships" },
          { consequence: "create_new", instructionId: "instruction.basket", quote: "add both to the basket" }
        ]
      },
      sentence: "The Flow would press \"Place order\" (button) each time it runs. That would spend, refund or move money, and that always needs your permission, even when your instruction asks for it."
    });
  });

  it("carries that request out whole: it round-trips the strict parser a person's copy is read back through", async () => {
    const run = gate({ derive: async () => readWell() });
    await run.checkFor(STEP)(CHECK_OUT);
    const request = run.request;

    expect(parseAutomationStudioActionPermissionRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
  });

  it("asks only about the destructive part, and still says what the whole action declared", async () => {
    const run = gate({ derive: async () => readWell() });

    expect(await run.checkFor(PRESS)(EMPTY_BASKET)).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:one" });
    expect(run.request?.consequences).toEqual(["delete", "modify_existing"]);
    expect(run.declarations[0]?.consequences).toEqual(["delete", "modify_existing"]);
    expect(run.declarations[0]?.missing).toEqual(["delete"]);
  });

  it("goes ahead once a person has permitted it, and not because the instruction asked for it", async () => {
    const granted = gate({ permitted: ["move_money"], derive: async () => readWell() });
    expect(await granted.checkFor(STEP)(CHECK_OUT)).toEqual({ permitted: true });
    expect(granted.request).toBeUndefined();

    const asked = gate({
      derive: async () => readAutomationStudioInstructedConsequences({
        instructions: [{ ...BASKET, body: "Buy the cheapest brass desk lamp and check out." }],
        result: { instructed: [{ consequence: "move_money", quote: "Buy the cheapest brass desk lamp and check out." }] }
      })
    });
    // Lane t195's bigbox runs: an instruction read as asking for `move_money`
    // let Place order through unasked in one run and not in the next.
    expect(await asked.checkFor(STEP)(CHECK_OUT)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:one" });
    expect(asked.request?.authority.instructed.map((entry) => entry.consequence)).toEqual(["move_money"]);

  });

  it("is refused where there is no run behind it, since no instruction could have asked", async () => {
    expect(await automationStudioActionPermissionDenied(CHECK_OUT)).toEqual({ permitted: false, missing: ["move_money"], requestId: null });
    expect(await automationStudioActionPermissionDenied(EMPTY_BASKET)).toEqual({ permitted: false, missing: ["delete"], requestId: null });
  });
});

// The class that came off the gate on 2026-09-26, and the thing that catches it
// instead. `BASKET` says "leave my saved address alone", so this press is an
// edit its instruction did not ask for -- and it now proceeds, because a
// standing gate on every edit asked a person about ordinary work. What sees it
// is the cross-check, which reads all five classes whatever is gated: narrowing
// what stops a run narrows nothing about what is known.
describe("an edit the gate no longer stops", () => {
  it("goes ahead, and is still recorded with the class it declared", async () => {
    const run = gate({ derive: async () => readWell() });

    expect(await run.checkFor(PRESS)(SAVE_ADDRESS)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.signal.aborted).toBe(false);
    expect(run.declarations[0]?.consequences).toEqual(["modify_existing", "create_new"]);
  });

  it("is named by the cross-check against the instruction, which is where it belongs now", async () => {
    const run = gate({ derive: async () => readWell() });
    await run.checkFor(PRESS)(SAVE_ADDRESS);

    const check = automationStudioActionDeclarationCrossCheck({
      declarations: run.declarations,
      instructed: readWell().filter((entry) => entry.consequence === "create_new")
    });

    expect(check.verdict).toBe("beyond_instruction");
    expect(check.beyondInstruction).toEqual(["modify_existing"]);
  });

  it("is permitted where there is no run behind it either", async () => {
    expect(await automationStudioActionPermissionDenied(SAVE_ADDRESS)).toEqual({ permitted: true });
  });
});
