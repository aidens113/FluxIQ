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
import type { AutomationStudioActionDeclaration, AutomationStudioActionPermissionVerdict } from "../../action-permissions/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";

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
