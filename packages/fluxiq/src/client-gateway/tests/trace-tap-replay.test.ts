// T01: the trace keeps inbound frames byte for byte -- nested values, unknown
// extension fields, empty objects, arrays and strings, explicit nulls and
// absent fields, number spellings, whitespace and key order -- so feeding the
// recorded text into a fresh gateway's `receiveRaw` decodes to the same events
// and settles the same command the same way. Ids are minted from a counter so
// the fresh gateway names its session and command as the live one did.

import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayEvent } from "../index.ts";
import { ofKind, openTrace, pairClient, traceScope } from "./trace-tap-support.ts";

const ids = vi.hoisted(() => ({ next: 0 }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => `00000000-0000-4000-8000-${String((ids.next += 1)).padStart(12, "0")}` };
});

const NOW = Date.parse("2026-10-20T10:00:00.000Z");
const VERSION = JSON.stringify(CLIENT_GATEWAY_PROTOCOL_VERSION);

function frames(commandId: string): string[] {
  return [
    `{"id":"frame-1",  "type":"client.state_update","protocolVersion":${VERSION},"timestamp":1.7e12,"payload":{"state":{"nested":{"deep":[1,2.50,1e3,{"x":null}]},"empty":{},"list":[],"text":""},"metadata":null},"extension":{"vendor":"value"}}`,
    `{"type":"client.recording_event","id":"frame-2","protocolVersion":${VERSION},"timestamp":1700000000001,"payload":{"eventType":"example.changed","payload":{"value":null,"items":[{}]}}}`,
    `{\n  "id": "frame-3",\n  "type": "client.action_result",\n  "protocolVersion": ${VERSION},\n  "timestamp": 1700000000002,\n  "payload": {"commandId":"${commandId}","status":"succeeded","message":"","payload":{"nested":{"a":[null,{"b":{}}]},"count":0.0},"metadata":{"extension":true,"trace":{"artifacts":[],"unavailable":0}},"unknownField":{"kept":[]}}\n}`
  ];
}

async function gatewayWithCommand(traced: boolean) {
  ids.next = 0;
  const scope = traceScope();
  const trace = openTrace("trace.replay");
  const gateway = new ClientGatewayService({ now: () => NOW, commandTimeoutMs: 60_000, ...(traced ? { trace: scope.source } : {}) });
  const client = await pairClient(gateway, "client.replay");
  const events: ClientGatewayEvent[] = [];
  gateway.onEvent((event) => { events.push(event); });
  const response = traced
    ? scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }))
    : gateway.executeAction(client.sessionId, { actionType: "example.press" });
  return { gateway, client, events, response, trace };
}

describe("a trace's inbound frames (T01)", () => {
  it("are recorded byte for byte and replay into a fresh gateway as the same events and the same settle", async () => {
    const live = await gatewayWithCommand(true);
    const sent = frames(live.response.commandId);
    for (const frame of sent) await live.gateway.receiveRaw(live.client.sessionId, frame);
    const liveResult = await live.response.result;

    const recorded = ofKind(await live.trace.events(), "inbound").map((event) => event.payload.encoding === "text" ? event.payload.text : null);
    expect(recorded).toEqual(sent);

    const fresh = await gatewayWithCommand(false);
    expect(fresh.response.commandId).toBe(live.response.commandId);
    for (const text of recorded) await fresh.gateway.receiveRaw(fresh.client.sessionId, text ?? "");
    const freshResult = await fresh.response.result;

    expect(freshResult).toEqual(liveResult);
    expect(liveResult).not.toHaveProperty("metadata.trace");
    expect(fresh.events).toEqual(live.events);
    expect(live.events.map((event) => event.type)).toEqual(["client.state_update", "client.recording_event", "client.action_result"]);
    await live.gateway.close();
    await fresh.gateway.close();
  });
});
