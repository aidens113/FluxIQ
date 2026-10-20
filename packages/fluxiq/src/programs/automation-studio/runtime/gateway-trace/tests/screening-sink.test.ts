import { describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder } from "../../../../../client-gateway/index.ts";
import { AutomationStudioGatewayTraceScreeningSink, screenAutomationStudioGatewayTracePayload } from "../index.ts";
import { gatewayEvent } from "./episode-builders.ts";

const API_KEY = "sk-abcdefghij0123456789xyz";
const CARD = "4111 1111 1111 1111";

function screenedSink() {
  const store = new ClientGatewayTraceMemoryStore();
  let clock = 1_000;
  const recorder = new ClientGatewayTraceRecorder(
    {
      traceId: "trace-1",
      episodeId: "run-1",
      activity: "execution",
      origin: { kind: "live" },
      contractVersions: {},
      capabilities: null,
      context: { schema: { name: "test", version: "1" }, value: null },
      streams: ["gateway"]
    },
    {
      store,
      now: () => {
        clock += 1;
        return clock;
      },
      maxBufferedEvents: 100,
      maxBufferedArtifactBytes: 1024
    }
  );
  return { sink: new AutomationStudioGatewayTraceScreeningSink(recorder), store };
}

describe("AutomationStudioGatewayTraceScreeningSink", () => {
  it("keeps a clean text event byte-identical, as text", async () => {
    const { sink, store } = screenedSink();
    const raw = '{"type":"client.state_update","payload":{"zeta":1.0,"alpha":null,"order":"112-5550123-4567890","at":1727712000000,"x-ext":{"kept":true}}}';
    sink.record(gatewayEvent({ encoding: "text", text: raw }));
    await sink.close({ terminationReason: "completed", terminationDetail: null });
    const [event] = await store.readEventRange("trace-1", 1, 1);
    expect(event?.payload.encoding === "text" && event.payload.text).toBe(raw);
    expect(event?.redactions).toEqual([]);
  });

  it("stores a text event holding a secret leaf and a card number as JSON with markers and secret redactions", async () => {
    const { sink, store } = screenedSink();
    const raw = JSON.stringify({ type: "client.action_result", payload: { values: ["plain", `token ${API_KEY}`], note: `card ${CARD} on file`, count: 2 } });
    sink.record(gatewayEvent({ encoding: "text", text: raw }, "client.action_result"));
    const manifest = await sink.close({ terminationReason: "completed", terminationDetail: null });
    const [event] = await store.readEventRange("trace-1", 1, 1);
    expect(event?.payload).toEqual({
      encoding: "json",
      value: { type: "client.action_result", payload: { values: ["plain", "[withheld: secret]"], note: "card [withheld: secret] on file", count: 2 } }
    });
    expect(event?.redactions).toEqual([
      { path: "/payload/values/1", reason: "secret" },
      { path: "/payload/note", reason: "secret" }
    ]);
    expect(JSON.stringify(event)).not.toContain(API_KEY);
    expect(JSON.stringify(event)).not.toContain("1111 1111");
    expect(manifest.completeness.status).toBe("complete");
  });

  it("keeps a redaction the gateway already declared beside the ones it adds", async () => {
    const { sink, store } = screenedSink();
    const input = gatewayEvent({ encoding: "json", value: { type: "client.hello", payload: { token: { redacted: "credential" }, page: `Bearer ${API_KEY}` } } }, "client.hello");
    sink.record({ ...input, redactions: [{ path: "/payload/token", reason: "credential" }] });
    await sink.flush();
    const [event] = await store.readEventRange("trace-1", 1, 1);
    expect(event?.redactions).toEqual([
      { path: "/payload/token", reason: "credential" },
      { path: "/payload/page", reason: "secret" }
    ]);
  });

  it("passes artifacts through unscreened", async () => {
    const { sink, store } = screenedSink();
    const result = sink.recordArtifact({
      stream: "gateway",
      messageType: null,
      mediaType: "image/png",
      bytes: new TextEncoder().encode(API_KEY),
      resourceKey: null,
      source: { id: null, sequence: null, timestamp: null },
      correlation: { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null }
    });
    expect(result.status).toBe("recorded");
    await sink.flush();
    expect((await store.listArtifacts("trace-1")).map((presence) => presence.byteLength)).toEqual([API_KEY.length]);
  });
});

describe("screenAutomationStudioGatewayTracePayload", () => {
  it("returns the very payload it was given when nothing is found", () => {
    const text = { encoding: "text" as const, text: '{"task-list":["Bearer YOUR_API_TOKEN_HERE"]}' };
    const json = { encoding: "json" as const, value: { nested: [{ a: "b" }] } };
    expect(screenAutomationStudioGatewayTracePayload(text).payload).toBe(text);
    expect(screenAutomationStudioGatewayTracePayload(json).payload).toBe(json);
    expect(screenAutomationStudioGatewayTracePayload({ encoding: "none" }).redactions).toEqual([]);
  });

  it("renames a secret-shaped key so the redaction path never repeats it", () => {
    const screened = screenAutomationStudioGatewayTracePayload({ encoding: "json", value: { headers: { [API_KEY]: "x", "a/b~c": `${API_KEY}` } } });
    expect(screened.payload).toEqual({ encoding: "json", value: { headers: { "[withheld secret key 0]": "x", "a/b~c": "[withheld: secret]" } } });
    expect(screened.redactions).toEqual([
      { path: "/headers/[withheld secret key 0]", reason: "secret" },
      { path: "/headers/a~1b~0c", reason: "secret" }
    ]);
    expect(JSON.stringify(screened)).not.toContain(API_KEY);
  });

  it("screens unparseable text as one leaf at the root", () => {
    expect(screenAutomationStudioGatewayTracePayload({ encoding: "text", text: `not json ${API_KEY}` })).toEqual({
      payload: { encoding: "json", value: "[withheld: secret]" },
      redactions: [{ path: "", reason: "secret" }]
    });
    const clean = { encoding: "text" as const, text: "not json {" };
    expect(screenAutomationStudioGatewayTracePayload(clean).payload).toBe(clean);
  });

  it("withholds a whole leaf when a card number sits beside another secret", () => {
    const screened = screenAutomationStudioGatewayTracePayload({ encoding: "json", value: [`${CARD} ${API_KEY}`] });
    expect(screened.payload).toEqual({ encoding: "json", value: ["[withheld: secret]"] });
  });
});
