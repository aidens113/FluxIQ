// The gateway's id source and timer source (traces and offline trials, P3):
// every id the gateway mints and every answer wait it starts goes through
// them, and every time stamp through its clock; unset, ids are UUIDs and waits
// run on the real clock, as before.

import { describe, expect, it } from "vitest";
import { ClientGatewayService, type ClientGatewayServerMessage } from "../../index.ts";
import { resolveClientGatewayConfig, type ClientGatewayIdKind, type ClientGatewayTimedWait } from "../index.ts";
import { clientMessage, pairClient } from "../../tests/trace-tap-support.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe("the gateway's id and timer sources", () => {
  it("mint every command id, message id and nonce, start every answer wait, and stamp every message with the gateway's clock", async () => {
    const kinds: ClientGatewayIdKind[] = [];
    const started: { wait: ClientGatewayTimedWait; delayMs: number }[] = [];
    const cancelled: string[] = [];
    const gateway = new ClientGatewayService({
      now: () => 1_234,
      createId: (kind) => {
        kinds.push(kind);
        return `${kind}-${kinds.length}`;
      },
      startTimer: (wait, delayMs) => {
        started.push({ wait, delayMs });
        return { cancel: () => cancelled.push(wait.commandId) };
      }
    });
    const client = await pairClient(gateway, "client.sources");
    const response = gateway.executeAction(client.sessionId, { actionType: "example.press" });

    expect(response.commandId).toMatch(/^command-\d+$/u);
    expect(response.message.id).toMatch(/^message-\d+$/u);
    expect(response.message.timestamp).toBe(1_234);
    expect(client.sent.at(-1)).toEqual(response.message);
    expect(started).toEqual([{ wait: { kind: "answer", commandId: response.commandId }, delayMs: 30_000 }]);

    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded" }));
    await expect(response.result).resolves.toMatchObject({ status: "succeeded" });
    expect(cancelled).toEqual([response.commandId]);

    await gateway.sendPing(client.sessionId);
    const ping: ClientGatewayServerMessage | undefined = client.sent.at(-1);
    expect(ping?.type === "server.ping" ? ping.payload.nonce : undefined).toMatch(/^nonce-\d+$/u);
    expect(ping?.id).toMatch(/^message-\d+$/u);
    await gateway.close();
  });

  it("default to UUIDs and real waits that a cancel stops", async () => {
    const config = resolveClientGatewayConfig({});
    expect(config.createId("message")).toMatch(UUID);
    expect(config.createId("command")).not.toBe(config.createId("command"));
    await new Promise<void>((resolve) => {
      config.startTimer({ kind: "answer", commandId: "command.fires" }, 1, resolve);
    });
    let fired = false;
    const timer = config.startTimer({ kind: "answer", commandId: "command.cancelled" }, 5, () => {
      fired = true;
    });
    timer.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(false);
  });
});
