import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_ASK_EFFECT,
  AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES,
  automationStudioAskEffect,
  automationStudioAskInEffects,
  automationStudioAskSettlement,
  automationStudioParkedRun,
  type AutomationStudioAsk,
  type AutomationStudioParkedRun
} from "../index.ts";

const RAISED_BY = { askId: "node.attempt.1", stage: "execution", nodeId: "node", definitionId: "builtin.routine.approval" } as const;

function parkedOn(ask: Partial<AutomationStudioAsk> = {}): AutomationStudioParkedRun {
  const raised: AutomationStudioAsk = {
    askId: "node.attempt.1",
    kind: "choice",
    parks: true,
    status: "pending",
    text: "Which address should the order ship to?",
    options: [
      { id: "home", label: "Home", route: null },
      { id: "work", label: "Work", route: "alternate" }
    ],
    raisedBy: { stage: "execution", nodeId: "node" },
    ...ask
  };
  return automationStudioParkedRun({
    ask: raised,
    nodeId: "node",
    definitionId: "builtin.routine.approval",
    attemptId: "node.attempt.1",
    parkedAtMs: 1_000,
    carried: { variables: {}, loops: {}, stepsTaken: 3, maxSteps: 250 }
  });
}

describe("what an ask leads to", () => {
  it("routes a grant, a refusal and a free-text answer by the ask's own routes", () => {
    const parked = parkedOn({ routes: { granted: "approved", denied: "rejected", timedOut: "rejected" } });

    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "grant", value: null, actorId: null }, 9)).toMatchObject({ outcome: "answered", route: "approved" });
    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "deny", value: null, actorId: null }, 9)).toMatchObject({ outcome: "answered", route: "rejected" });
    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "text", value: "go ahead", actorId: null }, 9)).toMatchObject({ outcome: "answered", route: "approved" });
  });

  it("routes a chosen option by its own route, or the answered route when it names none", () => {
    const parked = parkedOn();

    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "choice", value: "work", actorId: null }, 9)).toMatchObject({ outcome: "answered", route: "alternate" });
    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "choice", value: "home", actorId: null }, 9)).toMatchObject({ outcome: "answered", route: AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES.granted });
    expect(automationStudioAskSettlement(parked, { askId: parked.ask.askId, answeredAt: 2, kind: "choice", value: "neighbour", actorId: null }, 9)).toMatchObject({ outcome: "refused", reason: "unknown_choice" });
  });

  it("refuses an answer to an ask that is already settled, and one that names another ask", () => {
    expect(automationStudioAskSettlement(parkedOn({ status: "answered" }), { askId: "node.attempt.1", answeredAt: 2, kind: "grant", value: null, actorId: null }, 9)).toMatchObject({ outcome: "refused", reason: "already_settled" });
    expect(automationStudioAskSettlement(parkedOn(), { askId: "another", answeredAt: 2, kind: "grant", value: null, actorId: null }, 9)).toMatchObject({ outcome: "refused", reason: "ask_mismatch" });
  });

  it("makes nobody answering take the timed-out route, which `onTimeout: deny` resolves to the refusal route", () => {
    expect(automationStudioAskSettlement(parkedOn({ routes: { granted: "approved", denied: "rejected", timedOut: "approved" } }), undefined, 9))
      .toMatchObject({ outcome: "expired", route: "approved" });
    expect(parkedOn({ routes: { granted: "approved", denied: "rejected", timedOut: "approved" }, onTimeout: "deny" }).routes.timedOut).toBe("rejected");
  });

  it("gives an ask that waits indefinitely no deadline, and one with a timeout the deadline its wait implies", () => {
    expect(parkedOn().expiresAtMs).toBeUndefined();
    expect(parkedOn({ timeoutMs: 500 }).expiresAtMs).toBe(1_500);
  });
});

describe("reading an ask out of an attempt's effects", () => {
  it("completes a raised draft with the id, the pending status and where it came from", () => {
    const effects = [{ type: "policy.output.dispatch" }, automationStudioAskEffect({ kind: "confirm", parks: true, text: "Send it?" })];

    const ask = automationStudioAskInEffects(effects, RAISED_BY);

    expect(effects[1]?.type).toBe(AUTOMATION_STUDIO_ASK_EFFECT);
    expect(ask).toMatchObject({ askId: "node.attempt.1", kind: "confirm", parks: true, status: "pending", text: "Send it?" });
    expect(ask?.raisedBy).toEqual({ stage: "execution", nodeId: "node", definitionId: "builtin.routine.approval" });
  });

  it("keeps an id the raiser gave it, so a gate raises an ask under the key its own payload already carries", () => {
    const ask = automationStudioAskInEffects([automationStudioAskEffect({ askId: "permission-request-7", kind: "permission", parks: true, text: "Allow the purchase?" })], RAISED_BY);

    expect(ask?.askId).toBe("permission-request-7");
    expect(automationStudioAskInEffects([automationStudioAskEffect({ kind: "permission", parks: true, text: "Allow the purchase?" })], RAISED_BY)?.askId).toBe("node.attempt.1");
  });

  it("reads nothing where there is no ask, and nothing where the payload is not one", () => {
    expect(automationStudioAskInEffects([{ type: "policy.output.dispatch" }], RAISED_BY)).toBeUndefined();
    expect(automationStudioAskInEffects([{ type: AUTOMATION_STUDIO_ASK_EFFECT }], RAISED_BY)).toBeUndefined();
    const malformed: JsonValue[] = ["text", { kind: "confirm", parks: true }, { kind: "confirm", parks: "yes", text: "Send it?" }, { kind: "shout", parks: true, text: "Send it?" }, { kind: "confirm", parks: true, text: "   " }];
    for (const payload of malformed) {
      expect(automationStudioAskInEffects([{ type: AUTOMATION_STUDIO_ASK_EFFECT, payload }], RAISED_BY)).toBeUndefined();
    }
  });

  it("keeps only the parts of a payload that are well formed, so one bad field does not lose the question", () => {
    const ask = automationStudioAskInEffects([{
      type: AUTOMATION_STUDIO_ASK_EFFECT,
      payload: {
        kind: "choice",
        parks: true,
        text: "Which one?",
        timeoutMs: -5,
        onTimeout: "whenever",
        options: [{ id: "a" }, { label: "no id" }, "not an option"],
        routes: { granted: "yes" },
        missing: ["send_or_publish", 7]
      }
    }], RAISED_BY);

    expect(ask).toMatchObject({ kind: "choice", text: "Which one?", missing: ["send_or_publish"] });
    // An option is labelled by its id when it names no label, and names no route rather than leaving the field out.
    expect(ask?.options).toEqual([{ id: "a", label: "a", route: null }]);
    expect(ask?.timeoutMs).toBeUndefined();
    expect(ask?.onTimeout).toBeUndefined();
    // The one route named is kept and the two that were not are null, which is what the durable ask means by "none named".
    expect(ask?.routes).toEqual({ granted: "yes", denied: null, timedOut: null });
  });
});
