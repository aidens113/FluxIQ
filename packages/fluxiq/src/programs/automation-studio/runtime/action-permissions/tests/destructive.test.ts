// Which acts still need a person, and which the instruction alone settles.
//
// The property these rows protect is the one the product was losing for days:
// a run told to add something to a basket, save a listing for later or send a
// message must do it without a second permission. The counter-property is in the
// same file so neither can be relaxed without the other being read: a high-risk
// act nobody asked for still stops the run, and the question that reaches the
// person still carries everything they need to answer it.

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
  // The list has shrunk twice on the same rule -- the person's instruction is
  // itself the permission, so only a genuinely high-risk real-world consequence
  // reaches them. `modify_existing` left on 2026-09-26 because it is the
  // broadest of the five, so gating it asked about ordinary editing.
  // `send_or_publish` left on 2026-09-28 because a run that sends is a run whose
  // instruction asked for the sending, so gating it asked permission for the
  // request itself. Both are still declared, still recorded, and still compared
  // against the instruction by the cross-check.
  it("is exactly delete and money movement, and no others", () => {
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toEqual(["move_money", "delete"]);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => !isAutomationStudioDestructiveActionConsequence(consequence)))
      .toEqual(["send_or_publish", "modify_existing", "create_new"]);
    expect(isAutomationStudioDestructiveActionConsequence("send_or_publish")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence("modify_existing")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence("create_new")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence("purchase")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence(undefined)).toBe(false);
  });

  // The counted form of the same rule, so re-gating a class fails here too
  // however it is reintroduced.
  it("gates two of the five classes and leaves three ungated", () => {
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toHaveLength(5);
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toHaveLength(2);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter(isAutomationStudioDestructiveActionConsequence)).toHaveLength(2);
  });

  it("keeps Core's order, drops repeats, and drops ordinary creating, editing and sending", () => {
    expect(automationStudioDestructiveConsequences(["create_new", "delete", "move_money", "delete", "send_or_publish"]))
      .toEqual(["move_money", "delete"]);
    expect(automationStudioDestructiveConsequences(["create_new", "send_or_publish", "modify_existing"])).toEqual([]);
  });
});

describe("an act the person's instruction plainly asks for", () => {
  it("adds to the basket and sends the message with nothing permitted, and asks nobody", async () => {
    const run = gate({ derive: async () => readWell() });

    expect(await run.checkFor(PRESS)(ADD_TO_BASKET)).toEqual({ permitted: true });
    expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.signal.aborted).toBe(false);
  });

  it("is still recorded in full, so narrowing what stops a run narrows nothing about what is known", async () => {
    const run = gate({ derive: async () => readWell() });
    await run.checkFor(STEP)(SEND_MESSAGE);

    expect(run.declarations[0]).toEqual({
      action: { kind: "flow_step", id: "web.output.dom-click", ref: "main.s4", verb: "press", effect: "mutate" },
      control: { name: "Send message", kind: "button" },
      consequences: ["send_or_publish", "create_new"],
      permitted: true
    });
  });

  // The regression this row exists for. A send used to need the derivation that
  // reads the instruction to succeed, and that derivation misses whenever the
  // provider call fails, the model does not name the class, or the quote is not
  // the person's own words -- so an instruction that says "send the seller a
  // message" in so many words still stopped the run. Sending is ungated now, so
  // none of those three misses can stop it.
  it("still sends when the instruction's authority cannot be derived at all", async () => {
    const claimedNothing = gate({ derive: async () => readAutomationStudioInstructedConsequences({ instructions: [BASKET], result: { instructed: [] } }) });
    const providerDown = gate({ derive: async () => { throw new Error("provider down"); } });
    const noDerivation = gate();

    for (const run of [claimedNothing, providerDown, noDerivation]) {
      expect(await run.checkFor(PRESS)(ADD_TO_BASKET)).toEqual({ permitted: true });
      expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: true });
      expect(run.request).toBeUndefined();
      expect(run.signal.aborted).toBe(false);
    }
  });

  it("creates and sends with no run behind it either, since neither is anybody's to refuse", async () => {
    expect(await automationStudioActionPermissionDenied(ADD_TO_BASKET)).toEqual({ permitted: true });
    expect(await automationStudioActionPermissionDenied(SEND_MESSAGE)).toEqual({ permitted: true });
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
      sentence: "The Flow its instruction describes would press \"Place order\" (button) each time it runs, which would spend, refund or move money. Neither its instruction nor a grant allows that, so the build stopped to ask."
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

  it("goes ahead once a person's permission, or the instruction itself, covers it", async () => {
    const granted = gate({ permitted: ["move_money"], derive: async () => readWell() });
    expect(await granted.checkFor(STEP)(CHECK_OUT)).toEqual({ permitted: true });
    expect(granted.request).toBeUndefined();

    const asked = gate({
      derive: async () => readAutomationStudioInstructedConsequences({
        instructions: [{ ...BASKET, body: "Buy the cheapest brass desk lamp and check out." }],
        result: { instructed: [{ consequence: "move_money", quote: "Buy the cheapest brass desk lamp and check out." }] }
      })
    });
    expect(await asked.checkFor(STEP)(CHECK_OUT)).toEqual({ permitted: true });
    expect(asked.request).toBeUndefined();

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
