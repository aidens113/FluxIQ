// An in-test engine that implements the FluxNode HTTP description of the contracts
// (`@fluxiq/contracts/fluxnode/http`) and the key exchange of the keys design, with a
// scripted run. No real engine exists yet; this is what the SDK is proven against.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  FLUXNODE_API_BASE_PATH,
  FLUXNODE_ERROR_HTTP_STATUS,
  fluxNodeEventAnswerSchema,
  fluxNodeNameToFlowPath,
  dataPipelineHash,
  fluxNodeSpecHash,
  formatFluxNodeEventFrame,
  parseFluxNodeRunRequest,
  type DataPipeline,
  type FluxNodeErrorCode,
  type FluxNodeRunRequest,
  type FluxNodeSpec
} from "@fluxiq/contracts/fluxnode";
import { FakeRun } from "./fake-run.ts";
import { verifyProof } from "./verify-proof.ts";

export type Scenario = (run: FakeRun, request: FluxNodeRunRequest) => Promise<void>;

export type FakeEngineOptions = {
  scenario: Scenario;
  /** Refuse FluxNode calls that carry no session (keys turned on). */
  requireKey?: boolean;
  /** Skew the engine's clock by this many ms, to exercise the skew retry. */
  clockOffsetMs?: number;
  /** Answer 404 at the key exchange, as an engine with no keys would. */
  keysUnsupported?: boolean;
  /** Cut the first event stream after this many events, to exercise reconnecting. */
  dropFirstStreamAfter?: number;
};

export type RecordedRequest = { method: string; path: string; bearer: boolean; clientHeader: string | undefined; body: unknown };

export type FakeEngine = {
  url: string;
  requests: RecordedRequest[];
  runs: Map<string, FakeRun>;
  specs: Map<string, FluxNodeSpec>;
  /** The pipelines registered, or run, by name. */
  pipelines: Map<string, DataPipeline>;
  /** Teach the engine a public key (SPKI DER, base64url), as turning keys on does. */
  trust(publicKeyBase64Url: string): void;
  /** Forget every session, so the next call is refused as unauthenticated. */
  revokeSessions(): void;
  close(): Promise<void>;
};

const INSTANCE_ID = "inst_fake";

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function refuse(response: ServerResponse, code: FluxNodeErrorCode, message: string): void {
  send(response, FLUXNODE_ERROR_HTTP_STATUS[code], { error: { code, message } });
}

function runState(run: FakeRun): unknown {
  return {
    runId: run.id,
    name: run.name,
    state: run.result?.status ?? "running",
    startedAt: run.events[0]?.at ?? Date.now(),
    eventsPath: `${FLUXNODE_API_BASE_PATH}/runs/${run.id}/events`,
    cost: { calls: 0, tokens: 0, usd: 0 },
    ...(run.result === undefined ? {} : { result: run.result })
  };
}

/** Starts the fake engine on a free loopback port. */
export async function startFakeEngine(options: FakeEngineOptions): Promise<FakeEngine> {
  const requests: RecordedRequest[] = [];
  const runs = new Map<string, FakeRun>();
  const specs = new Map<string, FluxNodeSpec>();
  const pipelines = new Map<string, DataPipeline>();
  const known = new Map<string, Buffer>();
  const sessions = new Set<string>();
  let streamsOpened = 0;
  const nonces = new Set<string>();
  const now = (): number => Date.now() + (options.clockOffsetMs ?? 0);
  let origin = "";

  async function startRun(request: FluxNodeRunRequest, response: ServerResponse): Promise<void> {
    const spec = request.spec ?? (request.name === undefined ? undefined : specs.get(request.name));
    const resumed = request.resumeHandle === undefined ? undefined : [...runs.values()].find((run) => run.result?.resumeHandle === request.resumeHandle);
    const pipeline = request.pipeline ?? (request.name === undefined ? undefined : pipelines.get(request.name)) ?? (resumed === undefined ? undefined : pipelines.get(resumed.name));
    if (spec === undefined && pipeline === undefined && resumed === undefined) return refuse(response, "unknown_fluxnode", "No such FluxNode.");
    if (spec !== undefined) specs.set(spec.name, spec);
    if (pipeline !== undefined) pipelines.set(pipeline.name, pipeline);
    const run = new FakeRun(`run_${runs.size + 1}`, spec?.name ?? pipeline?.name ?? (resumed as FakeRun).name, request.inputs ?? resumed?.inputs ?? {});
    runs.set(run.id, run);
    run.emit({ type: "step", flowId: "flow_1", stepId: "start", label: "Starting", state: "started" });
    options.scenario(run, pipeline === undefined ? request : { ...request, pipeline }).catch((error: unknown) => {
      run.emit({ type: "step", flowId: "flow_1", stepId: "scenario", label: `Scenario failed: ${String(error)}`.slice(0, 200), state: "failed" });
    });
    return send(response, 200, runState(run));
  }

  function stream(run: FakeRun, after: number, response: ServerResponse): void {
    response.writeHead(200, { "content-type": "text/event-stream" });
    let sent = after;
    const dropAfter = streamsOpened === 0 ? options.dropFirstStreamAfter : undefined;
    streamsOpened += 1;
    const flush = (): void => {
      for (const event of run.events) {
        if (event.seq <= sent) continue;
        sent = event.seq;
        response.write(formatFluxNodeEventFrame(event));
        if (event.type === "ended") response.end();
        if (dropAfter !== undefined && sent >= dropAfter && event.type !== "ended") response.destroy();
      }
    };
    flush();
    if (!response.writableEnded) {
      const stop = run.subscribe(flush);
      response.on("close", stop);
    }
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://fake");
    const text = await readBody(request);
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    const authorization = request.headers.authorization;
    const clientHeader = request.headers["fluxiq-client"] as string | undefined;
    requests.push({ method: request.method ?? "GET", path: url.pathname + url.search, bearer: authorization !== undefined, clientHeader, body });
    if (url.pathname === "/.well-known/fluxiq") return send(response, 200, { instance: { id: INSTANCE_ID } });
    if (url.pathname === "/api/keys/session" && options.keysUnsupported === true) return send(response, 404, { error: { code: "not_found", message: "No keys here." } });
    if (url.pathname === "/api/keys/session" && request.method === "POST") {
      const check = verifyProof(body as Record<string, unknown>, known, `${origin}#${INSTANCE_ID}`, nonces, now());
      if (!check.ok) return send(response, 401, { error: { code: check.code, message: check.message, serverTime: check.serverTime } });
      const token = `fxs1.${randomBytes(4).toString("hex")}.${randomBytes(32).toString("base64url")}`;
      sessions.add(token);
      return send(response, 200, { sessionToken: token, expiresAt: now() + 3_600_000, serverTime: now(), principal: check.keyId, policy: "FluxNodeRunner" });
    }
    const bearer = authorization?.startsWith("Bearer ") === true ? authorization.slice(7) : undefined;
    if (bearer !== undefined && !sessions.has(bearer)) return refuse(response, "unauthenticated", "The session is not valid.");
    if (bearer === undefined && (options.requireKey === true || clientHeader === undefined)) return refuse(response, options.requireKey === true ? "unauthenticated" : "forbidden", "No key and no FluxIQ-Client header.");
    const base = `${FLUXNODE_API_BASE_PATH}/`;
    if (!url.pathname.startsWith(base)) return refuse(response, "invalid_request", "Not a FluxNode path.");
    const parts = url.pathname.slice(base.length).split("/");
    if (parts[0] === "specs" && request.method === "POST") {
      const pipeline = (body as { pipeline?: DataPipeline }).pipeline;
      if (pipeline !== undefined) {
        const createdPipeline = !pipelines.has(pipeline.name);
        pipelines.set(pipeline.name, pipeline);
        return send(response, 200, { name: pipeline.name, specHash: await dataPipelineHash(pipeline), flowPath: fluxNodeNameToFlowPath(pipeline.name), created: createdPipeline });
      }
      const spec = (body as { spec: FluxNodeSpec }).spec;
      const created = !specs.has(spec.name);
      specs.set(spec.name, spec);
      return send(response, 200, { name: spec.name, specHash: await fluxNodeSpecHash(spec), flowPath: fluxNodeNameToFlowPath(spec.name), created });
    }
    if (parts[0] === "fluxnodes" && parts[2] === "export" && request.method === "POST") {
      const name = decodeURIComponent(parts[1] ?? "");
      const spec = specs.get(name);
      if (spec === undefined) return refuse(response, "unknown_fluxnode", "No such FluxNode.");
      const pin = (body as { pin?: boolean }).pin === true;
      return send(response, 200, { format: "fluxiq.fluxnode-flow", formatVersion: 1, name, specHash: await fluxNodeSpecHash(spec), flowId: "flow_1", flowPath: fluxNodeNameToFlowPath(name), flowVersion: 2, pinned: pin, exportedAt: Date.now(), flow: { nodes: [], edges: [] } });
    }
    if (parts[0] === "runs" && parts.length === 1 && request.method === "POST") {
      const parsed = parseFluxNodeRunRequest(body);
      if (!parsed.ok) return send(response, 400, { error: { code: "invalid_request", message: "The run request is invalid.", issues: parsed.issues } });
      return startRun(parsed.value, response);
    }
    if (parts[0] === "runs" && parts.length === 1) {
      const list = [...runs.values()].map((run) => ({ runId: run.id, name: run.name, state: run.result?.status ?? "running", startedAt: run.events[0]?.at ?? 0, cost: { calls: 0, tokens: 0, usd: 0 } }));
      return send(response, 200, { runs: list });
    }
    const run = runs.get(parts[1] ?? "");
    if (parts[0] !== "runs" || run === undefined) return refuse(response, "unknown_run", "No such run.");
    if (parts.length === 2) return send(response, 200, runState(run));
    if (parts[2] === "events") return stream(run, Number(url.searchParams.get("after") ?? 0), response);
    if (parts[2] === "answers") {
      const answer = fluxNodeEventAnswerSchema.safeParse(body);
      if (!answer.success) return refuse(response, "invalid_request", "Not an answer.");
      run.answer(answer.data);
      return send(response, 200, { accepted: true });
    }
    if (parts[2] === "stop") {
      run.stopRequested = true;
      return send(response, 200, runState(run));
    }
    return refuse(response, "invalid_request", "Unknown endpoint.");
  }

  const server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, { error: { code: "internal", message: error instanceof Error ? error.message : "failed" } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: origin,
    requests,
    runs,
    specs,
    pipelines,
    revokeSessions: () => sessions.clear(),
    trust: (publicKey) => {
      const spki = Buffer.from(publicKey, "base64url");
      known.set(`fxk_${createHash("sha256").update(spki).digest("base64url").slice(0, 26)}`, spki);
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}
