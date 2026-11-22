// The task's own question and a chat's held answer, at the gate (t976, F21).
//
// Run `run-mwounh32-24f9bc6b` asked about deleting at its first Delete press, 85 decisions into the
// build, and again on the next attempt in the same chat. These pin what the gate does instead: one
// question about the classes, naming the task; a no that holds for every control; and an answer
// from earlier in the chat that is used rather than asked again.

import { describe, expect, it } from "vitest";
import { AutomationStudioActionPermissionGate } from "../gate.ts";
import { parseAutomationStudioActionPermissionRequest } from "../request.ts";
import { AUTOMATION_STUDIO_ACTION_PERMISSION_TASK_START, automationStudioActionPermissionTaskStartSentence, isAutomationStudioActionPermissionTaskStart } from "../task-start.ts";
import type { AutomationStudioActionDeclaration } from "../declaration.ts";

const DELETE_TOM: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Delete", kind: "button", item: "i:tom" }, verb: "press" };
const DELETE_DIEGO: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Remove request", kind: "button", item: "i:diego" }, verb: "press" };
const SEND: AutomationStudioActionDeclaration = { consequences: ["send_or_publish"], control: { name: "Send", kind: "button" }, verb: "press" };

function gate() {
  let next = 0;
  return new AutomationStudioActionPermissionGate({ stage: "authoring", instructionIds: ["instruction.requests"], endsOnRequest: false, newRequestId: () => `permission-request:${++next}`, now: () => 1_000 });
}

describe("the task-start question", () => {
  it("asks about the gated classes the task needs, naming the task, and is a request any client reads", () => {
    const own = gate();
    const request = own.raiseForTaskStart(["delete", "create_new", "modify_existing"]);
    expect(request).toMatchObject({
      action: { ...AUTOMATION_STUDIO_ACTION_PERMISSION_TASK_START },
      control: { name: null, kind: null },
      consequences: ["delete"],
      missing: ["delete"],
      sentence: "To do this task, FluxIQ needs to delete or remove something. Your answer holds for this whole chat, including when the task runs again."
    });
    expect(isAutomationStudioActionPermissionTaskStart(request)).toBe(true);
    // The same strict reading the thread and every client apply.
    expect(parseAutomationStudioActionPermissionRequest(request)).toEqual(request);
  });

  it("asks nothing when nothing gated is needed, or the chat already answered every class", () => {
    expect(gate().raiseForTaskStart(["create_new", "modify_existing"])).toBeUndefined();
    const answered = gate();
    answered.holdAnswer({ granted: ["delete"], declined: ["send_or_publish"], requestId: "permission-request:earlier" });
    expect(answered.raiseForTaskStart(["delete", "send_or_publish"])).toBeUndefined();
  });

  it("a grant permits every control declaring the class", async () => {
    const own = gate();
    own.raiseForTaskStart(["delete"]);
    own.settle("granted");
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.1" })(DELETE_TOM)).toEqual({ permitted: true });
    expect(await own.checkFor({ kind: "flow_step", id: "web.output.dom-click", ref: "main.delete" })(DELETE_DIEGO)).toEqual({ permitted: true });
    expect(own.request).toBeUndefined();
  });

  it("a no refuses the class on every control, unasked, carrying the request the person answered", async () => {
    const own = gate();
    own.raiseForTaskStart(["delete"]);
    own.settle("declined");
    const refused = { permitted: false, missing: ["delete"], requestId: "permission-request:1", declined: true };
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.1" })(DELETE_TOM)).toEqual(refused);
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.2" })(DELETE_DIEGO)).toEqual(refused);
    expect(own.standingDecline?.requestId).toBe("permission-request:1");
    // A class nobody was asked about is still a question of its own.
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.3" })(SEND)).toMatchObject({ permitted: false, missing: ["send_or_publish"], requestId: "permission-request:2" });
  });

  it("says each class in a person's words, in Core's order", () => {
    expect(automationStudioActionPermissionTaskStartSentence(["send_or_publish", "move_money"])).toBe(
      "To do this task, FluxIQ needs to spend, refund or move money and send or publish something that others will receive or see. Your answer holds for this whole chat, including when the task runs again."
    );
  });
});

describe("a chat's held answer", () => {
  it("permits what the person allowed and refuses what they refused, for every control, without a new request", async () => {
    const own = gate();
    own.holdAnswer({ granted: ["delete", "create_new"], declined: ["send_or_publish"], requestId: "permission-request:earlier" });
    expect(own.permittedClasses).toEqual(["delete"]);
    expect(own.declinedTaskClasses).toEqual(["send_or_publish"]);
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.1" })(DELETE_TOM)).toEqual({ permitted: true });
    expect(await own.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.2" })(SEND)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: "permission-request:earlier", declined: true });
    expect(own.request).toBeUndefined();
  });

  it("never grants a class the chat also refused, even when the refusal's request identifier is absent", async () => {
    const both = gate();
    both.holdAnswer({ granted: ["delete"], declined: ["delete"], requestId: "permission-request:earlier" });
    expect(await both.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.1" })(DELETE_TOM)).toMatchObject({ permitted: false, declined: true });
    const unnamed = gate();
    unnamed.holdAnswer({ granted: [], declined: ["delete"], requestId: null });
    expect(await unnamed.checkFor({ kind: "exploration_step", id: "core.run_node", ref: "call.1" })(DELETE_TOM)).toEqual({ permitted: false, missing: ["delete"], requestId: null, declined: true });
    expect(unnamed.request).toBeUndefined();
  });
});
