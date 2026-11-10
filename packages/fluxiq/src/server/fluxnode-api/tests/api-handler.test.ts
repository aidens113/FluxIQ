// The FluxNode HTTP API over a real loopback listener (port 0) and a fake service: every
// endpoint's happy path and a refusal, the event stream's replay and live delivery, and
// each open-mode guard.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fluxNodeErrorBodySchema, parseFluxNodeEventFrame, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkOpenModeGuards } from "../check-open-mode-guards.ts";
import { fluxNodeApiHandler } from "../api-handler.ts";
import { callApi, openApiCall, type ApiReply } from "./call-api.ts";
import { createFakeFluxNodeService, fakeEvent, FAKE_RUN_STATE, type FakeFluxNodeService } from "./fake-fluxnode-service.ts";

const BASE = "/api/fluxnode/v1";
const SPEC = { name: "notes.today", runtime: "linux", goal: "Read today's notes.", start: "gnome-text-editor", scope: { acts: [] } };
const OWNER = { principal: "owner", policy: "FluxNodeRunner", via: "open_mode" };

let server: Server;
let port = 0;
let service: FakeFluxNodeService;

beforeAll(async () => {
  service = createFakeFluxNodeService([fakeEvent(1, "step"), fakeEvent(2, "cost")]);
  server = createServer(fluxNodeApiHandler(service, { maxBodyBytes: 2048, keepAliveMs: 40 }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function post(path: string, body: unknown): Promise<ApiReply> {
  return callApi({ port, method: "POST", path: `${BASE}${path}`, body: JSON.stringify(body) });
}

function expectNoCors(reply: { headers: Record<string, unknown> }): void {
  expect(Object.keys(reply.headers).filter((name) => name.toLowerCase().startsWith("access-control-"))).toEqual([]);
}

function expectError(reply: ApiReply, status: number, code: string): void {
  expect(reply.status).toBe(status);
  const parsed = fluxNodeErrorBodySchema.safeParse(reply.json());
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.error.code).toBe(code);
  expectNoCors(reply);
}

describe("endpoints", () => {
  it("POST specs registers, as the open-mode owner", async () => {
    const reply = await post("/specs", { spec: SPEC });
    expect(reply.status).toBe(200);
    expect(reply.json()).toMatchObject({ created: true, flowPath: "notes/today" });
    expectNoCors(reply);
    expect(service.calls.at(-1)).toMatchObject({ method: "register", caller: OWNER });
  });

  it("POST specs refuses a body that is not a spec, with its issues", async () => {
    const reply = await post("/specs", { spec: { name: "x" } });
    expectError(reply, 400, "invalid_request");
    expect((reply.json() as { error: { issues?: unknown[] } }).error.issues?.length).toBeGreaterThan(0);
  });

  it("POST runs starts a run, and a service refusal keeps its status", async () => {
    const started = await post("/runs", { name: "notes.today", idempotencyKey: "k1" });
    expect(started.status).toBe(200);
    expect(started.json()).toEqual(FAKE_RUN_STATE);
    expectError(await post("/runs", { name: "notes.today", idempotencyKey: "conflict" }), 409, "idempotency_conflict");
    expectError(await post("/runs", {}), 400, "invalid_request");
  });

  it("GET runs lists with the query parsed, and refuses a bad one", async () => {
    const reply = await callApi({ port, path: `${BASE}/runs?limit=20&state=running` });
    expect(reply.status).toBe(200);
    expect(reply.json()).toEqual({ runs: [] });
    expect(service.calls.at(-1)).toMatchObject({ method: "list", args: [{ limit: 20, state: "running" }] });
    expectError(await callApi({ port, path: `${BASE}/runs?limit=999` }), 400, "invalid_request");
  });

  it("GET runs/{runId} reads a run, and an unknown one is 404", async () => {
    const reply = await callApi({ port, path: `${BASE}/runs/run_1` });
    expect(reply.json()).toEqual(FAKE_RUN_STATE);
    expectError(await callApi({ port, path: `${BASE}/runs/missing` }), 404, "unknown_run");
  });

  it("POST runs/{runId}/answers answers an event, and refuses a malformed answer", async () => {
    const reply = await post("/runs/run_1/answers", { type: "person_answer", eventId: "ev_1", outcome: "done" });
    expect(reply.json()).toEqual({ accepted: true });
    expectError(await post("/runs/run_1/answers", { type: "check_answer", eventId: "ev_1", pass: false }), 400, "invalid_request");
    expectError(await post("/runs/missing/answers", { type: "person_answer", eventId: "ev_1", outcome: "done" }), 404, "unknown_run");
  });

  it("POST runs/{runId}/stop stops, reads an empty body as {}, and refuses an ended run", async () => {
    const empty = await callApi({ port, method: "POST", path: `${BASE}/runs/run_1/stop` });
    expect(empty.status).toBe(200);
    expect(service.calls.at(-1)).toMatchObject({ method: "stop", args: ["run_1", {}] });
    expectError(await post("/runs/ended/stop", { reason: "enough" }), 409, "run_ended");
  });

  it("POST fluxnodes/{name}/export passes the request with its defaults, and shows a refusal", async () => {
    expectError(await post("/fluxnodes/notes.today/export", {}), 404, "unknown_fluxnode");
    expect(service.calls.at(-1)).toMatchObject({ method: "exportFlow", args: ["notes.today", { pin: false }] });
  });

  it("refuses a body over the limit and a body that is not JSON", async () => {
    expectError(await callApi({ port, method: "POST", path: `${BASE}/runs`, body: JSON.stringify({ name: "notes.today", correlationId: "x".repeat(4000) }) }), 400, "invalid_request");
    expectError(await callApi({ port, method: "POST", path: `${BASE}/runs`, body: "{nope" }), 400, "invalid_request");
  });

  it("answers a wrong method 405 with Allow, and an unknown path 404 in the error shape", async () => {
    const wrong = await callApi({ port, method: "POST", path: `${BASE}/runs/run_1` });
    expectError(wrong, 405, "invalid_request");
    expect(wrong.headers.allow).toBe("GET");
    expectError(await callApi({ port, method: "POST", path: `${BASE}/nowhere`, body: "{}" }), 404, "invalid_request");
    expectError(await callApi({ port, path: `${BASE}/runs/%E0%A4%A` }), 400, "invalid_request");
  });

  it("answers OPTIONS 405 with no CORS headers", async () => {
    const reply = await callApi({ port, method: "OPTIONS", path: `${BASE}/runs` });
    expectError(reply, 405, "invalid_request");
    expect(reply.headers.allow).toBe("POST, GET");
  });
});

describe("the event stream", () => {
  function readFrames(path: string, headers: Record<string, string>, until: (events: FluxNodeRunEvent[]) => boolean): Promise<{ events: FluxNodeRunEvent[]; text: string; ended: boolean; head: IncomingMessage }> {
    return new Promise((resolve, reject) => {
      let text = "";
      let head: IncomingMessage | undefined;
      const call = openApiCall({ port, path: `${BASE}${path}`, headers }, (response) => {
        head = response;
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
          if (until(framesOf(text))) {
            call.abort();
            resolve({ events: framesOf(text), text, ended: false, head: response });
          }
        });
        response.on("end", () => resolve({ events: framesOf(text), text, ended: true, head: head! }));
      });
      setTimeout(() => reject(new Error(`stream timed out with: ${text}`)), 4000).unref();
    });
  }

  function framesOf(text: string): FluxNodeRunEvent[] {
    const events: FluxNodeRunEvent[] = [];
    for (const frame of text.split("\n\n")) {
      const parsed = parseFluxNodeEventFrame(frame);
      if (parsed.ok) events.push(parsed.value);
    }
    return events;
  }

  it("replays what is stored after Last-Event-ID, then delivers live and ends after ended", async () => {
    const reading = readFrames("/runs/run_1/events", { "last-event-id": "1" }, () => false);
    await new Promise((resolve) => setTimeout(resolve, 120));
    service.push(fakeEvent(3, "ended"));
    const { events, text, ended, head } = await reading;
    expect(ended).toBe(true);
    expect(events.map((event) => event.seq)).toEqual([2, 3]);
    expect(head.headers["content-type"]).toBe("text/event-stream");
    expect(text.startsWith("id: 2\nevent: cost\n")).toBe(true);
    expect(text).toContain(": keep-alive");
    expect(Object.keys(head.headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
    expect(service.calls.filter((call) => call.method === "events").at(-1)?.args).toEqual(["run_1", 1]);
  });

  it("resumes from ?after= and replays a finished run, then ends", async () => {
    const { events, ended } = await readFrames("/runs/run_1/events?after=2", {}, () => false);
    expect(events.map((event) => event.seq)).toEqual([3]);
    expect(ended).toBe(true);
  });

  it("aborts the iteration's signal when the client disconnects", async () => {
    const before = service.signals.length;
    const call = await new Promise<{ abort: () => void }>((resolve) => {
      const opened = openApiCall({ port, path: `${BASE}/runs/run_1/events`, headers: { "last-event-id": "3" } }, () => resolve(opened));
    });
    const signal = service.signals[before]!;
    expect(signal.aborted).toBe(false);
    call.abort();
    await vi.waitFor(() => expect(signal.aborted).toBe(true), { timeout: 3000 });
  });

  it("refuses an unknown run and a bad position as ordinary errors", async () => {
    expectError(await callApi({ port, path: `${BASE}/runs/missing/events` }), 404, "unknown_run");
    expectError(await callApi({ port, path: `${BASE}/runs/run_1/events?after=soon` }), 400, "invalid_request");
  });
});

describe("open-mode guards", () => {
  const refusals: Array<[string, Record<string, string>, boolean?]> = [
    ["a Host that is not loopback", { host: "evil.example" }],
    ["a Host that merely starts with localhost", { host: "localhost.evil.example" }],
    ["any Origin", { origin: "http://localhost:3000" }],
    ["an Origin of null", { origin: "null" }],
    ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site same-origin", { "sec-fetch-site": "same-origin" }],
    ["a missing FluxIQ-Client", { "fluxiq-client": "" }, true],
    ["a POST that is not JSON", { "content-type": "text/plain" }]
  ];

  for (const [label, headers, drop] of refusals) {
    it(`refuses ${label} before anything reaches the service`, async () => {
      const calls = service.calls.length;
      const post = label.startsWith("a POST");
      const reply = await callApi({
        port,
        method: post ? "POST" : "GET",
        path: post ? `${BASE}/runs` : `${BASE}/runs/run_1`,
        headers: drop ? { "fluxiq-client": "" } : headers,
        ...(post ? { body: JSON.stringify({ name: "notes.today" }) } : {}),
        ...(drop ? { withDefaults: false } : {})
      });
      expect(reply.status).toBe(post ? 400 : 403);
      expectNoCors(reply);
      expect(fluxNodeErrorBodySchema.safeParse(reply.json()).success).toBe(true);
      expect(service.calls.length).toBe(calls);
    });
  }

  it("lets a loopback Host with a port, [::1], and Sec-Fetch-Site none through", async () => {
    for (const headers of [{ host: `localhost:${port}` }, { host: "[::1]" }, { "sec-fetch-site": "none" }]) {
      expect((await callApi({ port, path: `${BASE}/runs/run_1`, headers })).status).toBe(200);
    }
  });

  it("guards unknown paths and OPTIONS too, before the 404 and the 405", async () => {
    expect((await callApi({ port, path: `${BASE}/nowhere`, headers: { origin: "http://x.example" } })).status).toBe(403);
    expect((await callApi({ port, method: "OPTIONS", path: `${BASE}/runs`, headers: { origin: "http://x.example", "access-control-request-method": "POST" } })).status).toBe(403);
  });

  it("refuses a remote address that is not loopback", () => {
    const request = (remoteAddress: string | undefined): IncomingMessage =>
      ({ socket: { remoteAddress }, method: "GET", headers: { host: "localhost", "fluxiq-client": "sdk" } }) as unknown as IncomingMessage;
    expect(checkOpenModeGuards(request("10.0.0.5"))).toMatchObject({ code: "forbidden" });
    expect(checkOpenModeGuards(request(undefined))).toMatchObject({ code: "forbidden" });
    expect(checkOpenModeGuards(request("127.0.0.1"))).toBeNull();
    expect(checkOpenModeGuards(request("::1"))).toBeNull();
    expect(checkOpenModeGuards(request("::ffff:127.0.0.1"))).toBeNull();
  });
});
