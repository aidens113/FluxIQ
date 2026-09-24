// Which acts still need a person, and which the instruction alone settles.
//
// The property these rows protect is the one the product was losing for days:
// a run told to add something to a basket, save a listing for later or send a
// message must do it, with no grant, without asking anybody, and without
// needing a provider call to have gone well first. The counter-property is in
// the same file so neither can be relaxed without the other being read: a
// destructive act nobody asked for still stops the run, and the question that
// reaches the person still carries everything they need to answer it.

import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCES,
  AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES,
  AutomationStudioActionPermissionGate,
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
    evidence: { controls: ["Add to basket", "Send message", "Place order", "Save address"] },
    effectApplied: false
  });
  return built;
}

describe("which classes a person is still asked about", () => {
  it("is the three that take something away, and no others", () => {
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toEqual(["move_money", "delete", "modify_existing"]);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => !isAutomationStudioDestructiveActionConsequence(consequence)))
      .toEqual(["send_or_publish", "create_new"]);
    expect(isAutomationStudioDestructiveActionConsequence("purchase")).toBe(false);
    expect(isAutomationStudioDestructiveActionConsequence(undefined)).toBe(false);
  });

  it("keeps Core's order, drops repeats, and drops what takes nothing away", () => {
    expect(automationStudioDestructiveConsequences(["create_new", "modify_existing", "move_money", "modify_existing", "send_or_publish"]))
      .toEqual(["move_money", "modify_existing"]);
    expect(automationStudioDestructiveConsequences(["create_new", "send_or_publish"])).toEqual([]);
  });
});

describe("an act the person's instruction plainly asks for", () => {
  it("adds to the basket and sends the message with no grant, and asks nobody", async () => {
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

  // The live failure this removes. Reading the instruction needs a provider
  // call, the model has to name the class, and Core keeps a claim only where
  // its quote is the person's own words -- so a run that plainly asked to add
  // something to a basket used to stop at a question nobody was there to
  // answer whenever any one of those three missed. It cannot now: making
  // something was never the gate's to refuse.
  it("goes ahead even when reading the instruction claimed nothing at all", async () => {
    const claimedNothing = gate({ derive: async () => readAutomationStudioInstructedConsequences({ instructions: [BASKET], result: { instructed: [] } }) });
    const providerDown = gate({ derive: async () => { throw new Error("provider down"); } });
    const noDerivation = gate();

    for (const run of [claimedNothing, providerDown, noDerivation]) {
      expect(await run.checkFor(PRESS)(ADD_TO_BASKET)).toEqual({ permitted: true });
      expect(await run.checkFor(STEP)(SEND_MESSAGE)).toEqual({ permitted: true });
      expect(run.request).toBeUndefined();
    }
  });

  it("is permitted even where there is no run behind it and nobody to ask", async () => {
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

    expect(await run.checkFor(PRESS)(SAVE_ADDRESS)).toEqual({ permitted: false, missing: ["modify_existing"], requestId: "permission-request:one" });
    expect(run.request?.consequences).toEqual(["modify_existing", "create_new"]);
    expect(run.declarations[0]?.consequences).toEqual(["modify_existing", "create_new"]);
    expect(run.declarations[0]?.missing).toEqual(["modify_existing"]);
  });

  it("goes ahead once a grant, or the instruction itself, covers it", async () => {
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
    expect(await automationStudioActionPermissionDenied(SAVE_ADDRESS)).toEqual({ permitted: false, missing: ["modify_existing"], requestId: null });
  });
});
