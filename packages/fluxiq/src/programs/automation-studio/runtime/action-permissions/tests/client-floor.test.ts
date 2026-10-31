import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResolvedActionEffect } from "../../../nodes/index.ts";
import {
  AutomationStudioActionDeclarationError,
  AutomationStudioActionPermissionGate,
  automationStudioActionPermissionDenied,
  automationStudioInstructionDigest,
  type AutomationStudioActionDeclaration
} from "../index.ts";

const STEP = { kind: "flow_step" as const, id: "ledger.refund", ref: "main.refund" };
const MONEY: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: ["move_money"] };

function declaration(actionEffect: AutomationStudioResolvedActionEffect, consequences: AutomationStudioActionDeclaration["consequences"] = []): AutomationStudioActionDeclaration {
  return { consequences, actionEffect, effect: "observe", control: { name: "Refund", kind: "button" }, verb: "press" };
}

function gate(permittedConsequences: readonly string[] = []) {
  const run = new AutomationStudioActionPermissionGate({ stage: "authoring", permittedConsequences, endsOnRequest: false, newRequestId: () => "permission-request:floor" });
  run.observe({ control: "Refund" });
  return run;
}

describe("the trusted permission floor at both gate entries", () => {
  it("checks and records a client class when the model claims observe and none", async () => {
    const action = declaration(MONEY);
    const run = gate();
    expect(await run.checkFor(STEP)(action)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:floor" });
    expect(await automationStudioActionPermissionDenied(action)).toEqual({ permitted: false, missing: ["move_money"], requestId: null });
    expect(run.request).toMatchObject({ consequences: ["move_money"], missing: ["move_money"], control: { name: "Refund", kind: "button" } });
    expect(run.declarations).toEqual([{
      action: { ...STEP, verb: "press", effect: "mutate" },
      control: { name: "Refund", kind: "button" },
      consequences: ["move_money"], permitted: false, missing: ["move_money"], requestId: "permission-request:floor"
    }]);
  });

  it.each(["state", "commit"] as const)("does not exempt model classes as observation above a client %s floor", async (effectClass) => {
    const action = declaration({ effectClass, permissionConsequences: [] }, ["delete"]);
    const run = gate();
    expect(await run.checkFor(STEP)(action)).toMatchObject({ permitted: false, missing: ["delete"] });
    expect(await automationStudioActionPermissionDenied(action)).toEqual({ permitted: false, missing: ["delete"], requestId: null });
    expect(run.declarations[0]).toMatchObject({ action: { effect: "mutate" }, consequences: ["delete"], missing: ["delete"] });
    expect(run.declarations[0]).not.toHaveProperty("disregarded");
  });

  it("unions model-added classes with the client minimum before the request and record", async () => {
    const action = declaration(MONEY, ["create_new", "delete", "move_money"]);
    const run = gate(["delete"]);
    expect(await run.checkFor(STEP)(action)).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(run.request?.consequences).toEqual(["move_money", "delete", "create_new"]);
    expect(run.request?.missing).toEqual(["move_money"]);
    expect(run.declarations[0]?.consequences).toEqual(["move_money", "delete", "create_new"]);
    expect(await automationStudioActionPermissionDenied(action)).toEqual({ permitted: false, missing: ["move_money", "delete"], requestId: null });
  });

  it("honors granted classes without dropping them from the permitted record", async () => {
    const run = gate(["move_money", "delete"]);
    expect(await run.checkFor(STEP)(declaration(MONEY, ["delete"]))).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.declarations[0]).toMatchObject({ permitted: true, consequences: ["move_money", "delete"] });
    expect(run.declarations[0]).not.toHaveProperty("missing");
  });

  it("keeps a person's decline when the next declaration still claims observe and none", async () => {
    const run = gate();
    const check = run.checkFor(STEP);
    await check(declaration(MONEY));
    run.settle("declined");
    expect(await check(declaration(MONEY))).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:floor", declined: true });
    expect(run.standingDecline?.missing).toEqual(["move_money"]);
    expect(run.declarations[1]).toMatchObject({ permitted: false, consequences: ["move_money"], missing: ["move_money"] });
  });

  it("records the second floor's missing classes while keeping an unanswered request", async () => {
    const run = gate();
    await run.checkFor(STEP)(declaration(MONEY));
    expect(await run.checkFor({ ...STEP, ref: "main.delete" })(declaration({ effectClass: "commit", permissionConsequences: ["delete"] })))
      .toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:floor" });
    expect(run.request?.consequences).toEqual(["move_money"]);
    expect(run.declarations[1]).toMatchObject({ consequences: ["delete"], missing: ["delete"] });
  });

  it("does not turn an instructed class into a grant or expose an unseen control", async () => {
    const run = new AutomationStudioActionPermissionGate({
      stage: "authoring", permittedConsequences: [], newRequestId: () => "permission-request:floor",
      instructed: [{ consequence: "move_money", instructionId: "refund.one", instructionDigest: automationStudioInstructionDigest({ title: "Refund", body: "Refund the charge" }), quote: "Refund the charge" }]
    });
    expect(await run.checkFor(STEP)(declaration(MONEY))).toMatchObject({ permitted: false, missing: ["move_money"] });
    expect(run.request).toMatchObject({ control: { name: null }, authority: { granted: [], instructed: [{ consequence: "move_money", instructionId: "refund.one", quote: "Refund the charge" }] } });
  });

  it("rejects unknown client classes at both entries even beside a known class", async () => {
    const malformed: AutomationStudioActionDeclaration = {
      consequences: [], control: { name: "Refund", kind: "button" }, verb: "press", effect: "observe"
    };
    Object.assign(malformed, { actionEffect: { effectClass: "commit", permissionConsequences: ["move_money", "purchase"] } });
    const run = gate(["move_money"]);
    await expect(run.checkFor(STEP)(malformed)).rejects.toThrow(AutomationStudioActionDeclarationError);
    await expect(automationStudioActionPermissionDenied(malformed)).rejects.toThrow(AutomationStudioActionDeclarationError);
    expect(run.declarations).toEqual([]);
    expect(run.request).toBeUndefined();
  });

  it.each(["state", "commit"] as const)("does not invent money or another permission class from %s alone", async (effectClass) => {
    const run = gate();
    const action = declaration({ effectClass, permissionConsequences: [] });
    expect(await run.checkFor(STEP)(action)).toEqual({ permitted: true });
    expect(await automationStudioActionPermissionDenied(action)).toEqual({ permitted: true });
    expect(run.request).toBeUndefined();
    expect(run.declarations[0]).toMatchObject({ action: { effect: "mutate" }, consequences: [], permitted: true });
  });

  it.each([undefined, { effectClass: "observe", permissionConsequences: [] }] as const)("preserves truthful observation and legacy absence without deriving authority (%j)", async (actionEffect) => {
    const deriveInstructed = vi.fn(async () => []);
    const run = new AutomationStudioActionPermissionGate({ stage: "authoring", deriveInstructed });
    const action: AutomationStudioActionDeclaration = { consequences: ["delete"], effect: "observe", control: { name: "Read" }, verb: "read" };
    if (actionEffect) action.actionEffect = actionEffect;
    expect(await run.checkFor(STEP)(action)).toEqual({ permitted: true });
    expect(await automationStudioActionPermissionDenied(action)).toEqual({ permitted: true });
    expect(run.declarations[0]).toEqual({ action: { ...STEP, verb: "read", effect: "observe" }, control: { name: null, kind: null }, consequences: [], permitted: true, disregarded: ["delete"] });
    expect(deriveInstructed).not.toHaveBeenCalled();
  });
});
