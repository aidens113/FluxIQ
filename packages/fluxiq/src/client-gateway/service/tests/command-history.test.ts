import { describe, expect, it } from "vitest";
import { readClientGatewayActionResult } from "../action-result-reading.ts";
import { ClientGatewayCommandHistory } from "../command-history.ts";

const sender = { sessionId: "session.1", clientId: "client.1" };
const answer = (commandId: string) => readClientGatewayActionResult({ commandId, status: "succeeded", message: "page words", payload: { text: "page words" }, target: { selector: "#x" } });

describe("the commands a gateway sent recently", () => {
  it("forgets the oldest past its bound, so a result for a forgotten command is simply unknown", () => {
    const history = new ClientGatewayCommandHistory(() => 1);
    for (let index = 0; index <= ClientGatewayCommandHistory.LIMIT; index += 1) {
      history.opened({ commandId: `command.${index}`, sessionId: sender.sessionId, clientId: sender.clientId, actionType: "example.press", durable: false });
    }
    expect(history.intake(sender, answer("command.0"))).toEqual({ kind: "unknown_command" });
    expect(history.intake(sender, answer(`command.${ClientGatewayCommandHistory.LIMIT}`)).kind).toBe("late");
  });

  it("keeps the first closure, drops an owner that is not a pair of plain ids, and records no words the client sent", () => {
    let now = 10;
    const history = new ClientGatewayCommandHistory(() => now);
    history.opened({ commandId: "command.1", sessionId: sender.sessionId, clientId: sender.clientId, actionType: "example.press", durable: false, owner: { projectId: "project 1", runId: "run.1" } });
    now = 20;
    history.closed("command.1", "timed_out");
    now = 30;
    history.closed("command.1", "settled");
    const intake = history.intake(sender, answer("command.1"));
    expect(intake).toEqual({ kind: "late", late: {
      commandId: "command.1", actionType: "example.press", durable: false, closedAs: "timed_out",
      dispatchedAt: 10, closedAt: 20, receivedAt: 30, status: "succeeded", reportedStatus: "succeeded", interrupted: false, sameSession: true
    } });
    expect(JSON.stringify(intake)).not.toContain("page words");
  });

  it("refuses a result from a client the command was not sent to", () => {
    const history = new ClientGatewayCommandHistory(() => 1);
    history.opened({ commandId: "command.1", sessionId: sender.sessionId, clientId: sender.clientId, actionType: "example.press", durable: false });
    expect(history.intake({ sessionId: "session.2", clientId: "client.2" }, answer("command.1"))).toEqual({ kind: "foreign_client" });
  });
});
