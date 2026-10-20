import { describe, expect, it } from "vitest";
import type { ClientGatewayTraceEventInput, ClientGatewayTraceRecordResult, ClientGatewayTraceSink } from "../../../../../client-gateway/index.ts";
import { ClientGatewayService, ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder } from "../../../../../client-gateway/index.ts";
import { pairClient } from "../../../../../client-gateway/tests/trace-tap-support.ts";
import { AutomationStudioGatewayTraceFlushingSink } from "../flushing-sink.ts";
import { AutomationStudioGatewayTraceScreeningSink, screenAutomationStudioGatewayTracePayload } from "../index.ts";
import { gatewayEvent } from "./episode-builders.ts";

const API_KEY = "sk-abcdefghij0123456789xyz";
const CARD = "4111 1111 1111 1111";
/** A lower-case hex SHA-256 whose one long digit run (`4111111111111111`) passes Luhn: a card to the card screen alone. */
const LUHN_DIGEST = `${"ab".repeat(24)}4111111111111111`;

/** An inner sink that keeps each event input it is handed, then records it. */
function capturing(inner: ClientGatewayTraceSink, seen: ClientGatewayTraceEventInput[]): ClientGatewayTraceSink {
  return {
    record: (input: ClientGatewayTraceEventInput): ClientGatewayTraceRecordResult => {
      seen.push(input);
      return inner.record(input);
    },
    recordArtifact: (input) => inner.recordArtifact(input),
    markCheckpoint: (input) => inner.markCheckpoint(input),
    flush: () => inner.flush(),
    close: (input) => inner.close(input),
    status: () => inner.status()
  };
}

function screenedSink(): { sink: AutomationStudioGatewayTraceScreeningSink; store: ClientGatewayTraceMemoryStore; recorder: ClientGatewayTraceRecorder } {
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
  return { sink: new AutomationStudioGatewayTraceScreeningSink(recorder), store, recorder };
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

  it("keeps the artifact digests an event references, whether or not it screens the payload", async () => {
    const { sink, store } = screenedSink();
    const referenced = ["a".repeat(64)];
    sink.record({ ...gatewayEvent({ encoding: "text", text: JSON.stringify({ note: `token ${API_KEY}` }) }, "client.action_result"), referencedDigests: referenced });
    sink.record({ ...gatewayEvent({ encoding: "text", text: "{}" }, "client.action_result"), referencedDigests: referenced });
    await sink.flush();
    const events = await store.readEventRange("trace-1", 1, 2);
    expect(events[0]?.redactions).toEqual([{ path: "/note", reason: "secret" }]);
    expect(events.map((event) => event.referencedDigests)).toEqual([referenced, referenced]);
  });

  it("keeps every field of a redacted event, the session and any field added later included", async () => {
    const { recorder, store } = screenedSink();
    const seen: ClientGatewayTraceEventInput[] = [];
    const sink = new AutomationStudioGatewayTraceScreeningSink(capturing(recorder, seen));
    const base = gatewayEvent({ encoding: "text", text: JSON.stringify({ note: `token ${API_KEY}` }) }, "client.action_result");
    const input: ClientGatewayTraceEventInput & { laterField: string } = {
      ...base,
      kind: "outbound",
      source: { id: "msg-9", sequence: 4, timestamp: "2026-10-20T10:00:00.000Z" },
      correlation: { commandId: "cmd-1", recordingId: "rec-1", causationEventId: "evt-1", owner: "owner-1", observationRevision: "rev-3", baseRevision: "rev-2" },
      payloadSchema: { name: "client.action_result", version: "1" },
      artifactIds: ["artifact-1"],
      referencedDigests: ["c".repeat(64)],
      redactions: [{ path: "/token", reason: "credential" }],
      session: "session-2",
      laterField: "kept"
    };
    sink.record(input);
    expect(seen).toHaveLength(1);
    const [forwarded] = seen;
    expect(forwarded?.redactions).toEqual([
      { path: "/token", reason: "credential" },
      { path: "/note", reason: "secret" }
    ]);
    expect(forwarded?.payload).toEqual({ encoding: "json", value: { note: "[withheld: secret]" } });
    const { payload: _payload, redactions: _redactions, ...kept } = input;
    const { payload: _forwardedPayload, redactions: _forwardedRedactions, ...forwardedKept } = forwarded ?? input;
    expect(forwardedKept).toEqual(kept);
    await sink.flush();
    const [stored] = await store.readEventRange("trace-1", 1, 1);
    expect(stored?.session).toBe("session-2");
    expect(stored?.referencedDigests).toEqual(["c".repeat(64)]);
  });

  it("reports its trace's id through the flushing sink, so the gateway's action stamp names that trace as its scope", async () => {
    const { recorder } = screenedSink();
    const sink = new AutomationStudioGatewayTraceScreeningSink(new AutomationStudioGatewayTraceFlushingSink(recorder, { everyEvents: 100, intervalMs: 60_000 }, () => undefined));
    expect(sink.status().traceId).toBe("trace-1");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: { current: () => sink } });
    const client = await pairClient(gateway, "client.scope");
    const response = gateway.executeAction(client.sessionId, { actionType: "example.press" });
    const metadata = response.message.type === "server.execute_action" ? response.message.payload.metadata : undefined;
    expect(metadata).toEqual({ trace: { artifacts: true, scope: "trace-1" } });
    await sink.close({ terminationReason: "completed", terminationDetail: null });
    await gateway.close();
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

  it("keeps a leaf that is exactly a lower-case hex SHA-256 even when its digits pass the card screen", () => {
    expect(screenAutomationStudioGatewayTracePayload({ encoding: "json", value: [LUHN_DIGEST] }).redactions).toEqual([]);
    const text = { encoding: "text" as const, text: JSON.stringify({ digest: LUHN_DIGEST, digests: [LUHN_DIGEST] }) };
    expect(screenAutomationStudioGatewayTracePayload(text).payload).toBe(text);
  });

  it("still withholds a card number in text, and screens a hex string that is not exactly a lower-case SHA-256", () => {
    expect(screenAutomationStudioGatewayTracePayload({ encoding: "json", value: { note: `card ${CARD} on file` } }).payload).toEqual({
      encoding: "json",
      value: { note: "card [withheld: secret] on file" }
    });
    const upper = `${LUHN_DIGEST.slice(0, 47)}B${LUHN_DIGEST.slice(48)}`;
    const shorter = LUHN_DIGEST.slice(1);
    const longer = `a${LUHN_DIGEST}`;
    const inText = `digest ${LUHN_DIGEST}`;
    for (const leaf of [upper, shorter, longer, inText]) {
      const screened = screenAutomationStudioGatewayTracePayload({ encoding: "json", value: [leaf] });
      expect(screened.redactions).toEqual([{ path: "/0", reason: "secret" }]);
      expect(JSON.stringify(screened.payload)).not.toContain("4111111111111111");
    }
  });

  it("withholds a whole leaf when a card number sits beside another secret", () => {
    const screened = screenAutomationStudioGatewayTracePayload({ encoding: "json", value: [`${CARD} ${API_KEY}`] });
    expect(screened.payload).toEqual({ encoding: "json", value: ["[withheld: secret]"] });
  });
});
