import { describe, expect, it } from "vitest";
import { clientGatewayReconciledResult } from "../reconciled-result.ts";
import { readClientGatewayReconcileAnswer } from "../answer-reading.ts";
import { clientGatewaySessionAnswersReconcile } from "../session-answers.ts";

describe("reading a client's reconcile answer", () => {
  it("takes each closed state for the command asked about", () => {
    for (const state of ["not_seen", "running", "unknown"] as const) {
      expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.1", state })).toEqual({ commandId: "command.1", state });
    }
    expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.1", state: "landed", result: { commandId: "command.1", status: "succeeded" } })).toEqual({ commandId: "command.1", state: "landed", result: { commandId: "command.1", status: "succeeded" } });
  });

  it("is no answer for another command, an unknown word, or a value that is not an object", () => {
    expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.2", state: "not_seen" })).toBeUndefined();
    expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.1", state: "maybe" })).toBeUndefined();
    expect(readClientGatewayReconcileAnswer("command.1", ["not_seen"])).toBeUndefined();
  });

  it("reads a landed answer without this command's kept result as unknown", () => {
    expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.1", state: "landed" })).toEqual({ commandId: "command.1", state: "unknown" });
    expect(readClientGatewayReconcileAnswer("command.1", { commandId: "command.1", state: "landed", result: { commandId: "command.1", status: "done" } })).toEqual({ commandId: "command.1", state: "unknown" });
  });
});

describe("the result a reconciled command settles with", () => {
  it("reads a kept interrupted result as any result is read", () => {
    const result = clientGatewayReconciledResult("command.1", { commandId: "command.1", state: "landed", result: { commandId: "command.1", status: "interrupted", payload: { status: "interrupted" } } }, 100);
    expect(result).toMatchObject({ commandId: "command.1", status: "unknown", metadata: { reconciled: "landed" } });
  });

  it("is today's timed_out, unmarked, when nobody was asked", () => {
    expect(clientGatewayReconciledResult("command.1", undefined, 100)).toEqual({ commandId: "command.1", status: "timed_out", message: "Client action timed out after 100ms." });
  });
});

describe("whether a session answers", () => {
  it("only when a capability it declared says so", () => {
    expect(clientGatewaySessionAnswersReconcile({ capabilities: [{ id: "web.actions.reconcile", kind: "action", metadata: { answersReconcile: true } }] })).toBe(true);
    expect(clientGatewaySessionAnswersReconcile({ capabilities: [{ id: "web.actions.reconcile", kind: "action", metadata: { dedupe: "commandId" } }] })).toBe(false);
    expect(clientGatewaySessionAnswersReconcile({ capabilities: [] })).toBe(false);
  });
});
