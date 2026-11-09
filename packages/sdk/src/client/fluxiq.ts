// The client: `FluxIQ.connect()` finds the engine and any key, then `run` and `stream`
// drive FluxNodes over the FluxNode HTTP API. Everything the engine decides stays in
// the engine; this is a thin client (plan, N9).

import {
  FLUXNODE_API_PATHS,
  fluxNodeApiPath,
  fluxNodeFlowExportSchema,
  fluxNodeListRunsResponseSchema,
  fluxNodeRegisterSpecResponseSchema,
  fluxNodeRunStateSchema,
  fluxNodeStopRunResponseSchema,
  type FluxNodeFlowExport,
  type FluxNodeListRunsQuery,
  type FluxNodeListRunsResponse,
  type FluxNodeRegisterSpecResponse,
  type FluxNodeRunEvent,
  type FluxNodeRunStateBody
} from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode, FluxNode, InputOf, OutputOf } from "../define/index.ts";
import { SdkError } from "../errors/index.ts";
import { resolveCredential } from "../keys/index.ts";
import type { TypeSchemaInput } from "../schema/index.ts";
import { createSession } from "../session/index.ts";
import { buildResumeRequest, buildRunRequest } from "./build-run-request.ts";
import type { ConnectOptions } from "./connect-options.ts";
import { executeRun } from "./execute-run.ts";
import { finishRun } from "./finish-run.ts";
import { followRun } from "./follow-run.ts";
import { resolveEndpoint } from "./resolve-endpoint.ts";
import type { RunOptions, RunOutcome } from "./run-types.ts";
import { createTransport, type Transport } from "./transport.ts";

type Schemas = TypeSchemaInput | undefined;

async function endedResult(events: AsyncGenerator<FluxNodeRunEvent>): Promise<Extract<FluxNodeRunEvent, { type: "ended" }>["result"]> {
  for await (const event of events) {
    if (event.type === "ended") return event.result;
  }
  throw new SdkError("stream_lost", "The event stream closed without the run's ended event.");
}

/** A connection to a FluxIQ engine, local or cloud. Make one with `FluxIQ.connect()`. */
export class FluxIQ {
  /** The engine's address. */
  readonly url: string;
  readonly #transport: Transport;

  private constructor(url: string, transport: Transport) {
    this.url = url;
    this.#transport = transport;
  }

  /**
   * Finds the engine and the credential and proves the key once, so a broken key or an
   * unreachable engine fails here. The credential chain: an explicit option,
   * `FLUXIQ_KEY` or `FLUXIQ_KEY_FILE`, `FLUXIQ_KEY_PROFILE`, a profile named in
   * `fluxiq.config.json`, the `[default]` profile of `~/.fluxiq/credentials`, and
   * otherwise open mode (a local engine only).
   */
  static async connect(options: ConnectOptions = {}): Promise<FluxIQ> {
    const env = options.env ?? process.env;
    const cwd = options.cwd ?? process.cwd();
    const chain: { apiKey?: string; keyFile?: string; profile?: string } = {};
    if (options.apiKey !== undefined) chain.apiKey = options.apiKey;
    if (options.keyFile !== undefined) chain.keyFile = options.keyFile;
    if (options.profile !== undefined) chain.profile = options.profile;
    const credential = resolveCredential(chain, { env, cwd });
    const url = resolveEndpoint(options.url, credential, env, cwd);
    const fetcher = options.fetch ?? globalThis.fetch;
    const session = createSession({ baseUrl: url, credential, fetch: fetcher });
    await session.headers();
    return new FluxIQ(url, createTransport({ baseUrl: url, session, fetch: fetcher }));
  }

  /**
   * Runs `node` over `inputs` and returns how it ended. An achieved run's `outputs`
   * are typed by the node's zod outputs. Budget out, a stop and a wait for a person are
   * endings, not errors: narrow on `status`, and use `resumeHandle` with `resume`.
   */
  async run<I extends Schemas, O extends Schemas>(node: FluxNode<I, O>, inputs: InputOf<I>, options: RunOptions = {}): Promise<RunOutcome<OutputOf<O>>> {
    const result = await endedResult(this.stream(node, inputs, options));
    return finishRun<OutputOf<O>>(node as unknown as AnyFluxNode, result);
  }

  /** Continues a run that ended `budget_out` or `waiting_for_person`, from its `resumeHandle`. */
  async resume<I extends Schemas, O extends Schemas>(node: FluxNode<I, O>, resumeHandle: string, options: RunOptions = {}): Promise<RunOutcome<OutputOf<O>>> {
    const events = executeRun(this.#transport, buildResumeRequest(resumeHandle, options), node as unknown as AnyFluxNode, options);
    return finishRun<OutputOf<O>>(node as unknown as AnyFluxNode, await endedResult(events));
  }

  /**
   * Runs `node` and yields every event: steps, cost, and the ones that wait for this
   * process, which are answered before they are yielded (the check, `onPersonNeeded`,
   * transforms). The last event is `ended`.
   */
  stream<I extends Schemas, O extends Schemas>(node: FluxNode<I, O>, inputs: InputOf<I>, options: RunOptions = {}): AsyncGenerator<FluxNodeRunEvent> {
    const any = node as unknown as AnyFluxNode;
    return executeRun(this.#transport, buildRunRequest(any, inputs, options), any, options);
  }

  /** Runs `node` once per sample, one after another, as `fluxiq learn` does before deployment. */
  async learn<I extends Schemas, O extends Schemas>(node: FluxNode<I, O>, samples: Array<InputOf<I>>, options: RunOptions = {}): Promise<Array<RunOutcome<OutputOf<O>>>> {
    const outcomes: Array<RunOutcome<OutputOf<O>>> = [];
    for (const sample of samples) outcomes.push(await this.run(node, sample, options));
    return outcomes;
  }

  /** Registers `node`'s spec without running it. Idempotent. */
  register(node: AnyFluxNode): Promise<FluxNodeRegisterSpecResponse> {
    return this.#transport.json({ method: "POST", path: FLUXNODE_API_PATHS.specs, body: { spec: node.spec }, answer: fluxNodeRegisterSpecResponseSchema });
  }

  /** A run's state, with its result once it has ended. */
  getRun(runId: string): Promise<FluxNodeRunStateBody> {
    return this.#transport.json({ method: "GET", path: fluxNodeApiPath("run", { runId }), answer: fluxNodeRunStateSchema });
  }

  /** A page of runs, newest first. */
  listRuns(query: Partial<FluxNodeListRunsQuery> = {}): Promise<FluxNodeListRunsResponse> {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) parameters.set(key, String(value));
    const text = parameters.toString();
    return this.#transport.json({ method: "GET", path: text === "" ? FLUXNODE_API_PATHS.runs : `${FLUXNODE_API_PATHS.runs}?${text}`, answer: fluxNodeListRunsResponseSchema });
  }

  /** Stops a run; it ends `stopped` with what it has. */
  stop(runId: string, reason?: string): Promise<FluxNodeRunStateBody> {
    return this.#transport.json({ method: "POST", path: fluxNodeApiPath("runStop", { runId }), body: reason === undefined ? {} : { reason }, answer: fluxNodeStopRunResponseSchema });
  }

  /** A FluxNode's learned Flow as a reviewable document; with `pin`, the engine replays exactly that Flow from now on. */
  exportFlow(name: string, options: { specHash?: string; pin?: boolean } = {}): Promise<FluxNodeFlowExport> {
    const body: { specHash?: string; pin: boolean } = { pin: options.pin ?? false };
    if (options.specHash !== undefined) body.specHash = options.specHash;
    return this.#transport.json({ method: "POST", path: fluxNodeApiPath("fluxNodeExport", { name }), body, answer: fluxNodeFlowExportSchema });
  }

  /** Follows a run that is already going, from its first event or after `after`. Answers nothing. */
  follow(runId: string, after = 0): AsyncGenerator<FluxNodeRunEvent> {
    return followRun(this.#transport, fluxNodeApiPath("runEvents", { runId }), { after });
  }
}

