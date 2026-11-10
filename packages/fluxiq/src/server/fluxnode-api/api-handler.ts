import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import {
  FLUXNODE_API_METHODS,
  FLUXNODE_EVENT_STREAM,
  fluxNodeAnswerEventRequestSchema,
  fluxNodeExportFlowRequestSchema,
  fluxNodeFieldSchemas,
  fluxNodeListRunsQuerySchema,
  fluxNodeNameSchema,
  fluxNodeRegisterSpecRequestSchema,
  fluxNodeStartRunRequestSchema,
  fluxNodeStopRunRequestSchema,
  type FluxNodeApiEndpoint
} from "@fluxiq/contracts/fluxnode";
import type { FluxNodeService, FluxNodeServiceOutcome } from "../../framework/automation-service/service/fluxnode/index.ts";
import { checkOpenModeGuards } from "./check-open-mode-guards.ts";
import type { FluxNodeApiOptions } from "./handler-options.ts";
import { FLUXNODE_OPEN_MODE_CALLER } from "./open-mode-caller.ts";
import type { FluxNodeHttpRefusal } from "./http-refusal.ts";
import { parseFluxNodeBody, type FluxNodeBodySchema } from "./parse-fluxnode-body.ts";
import { readFluxNodeJsonBody } from "./read-fluxnode-json-body.ts";
import { routeFluxNodePath, type FluxNodeRoute } from "./route-fluxnode-path.ts";
import { streamFluxNodeEvents } from "./stream-fluxnode-events.ts";
import { writeFluxNodeJson } from "./write-fluxnode-json.ts";
import { writeFluxNodeRefusal } from "./write-fluxnode-refusal.ts";

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_KEEP_ALIVE_MS = 15_000;
const CALLER = FLUXNODE_OPEN_MODE_CALLER;

type Context = { service: FluxNodeService; request: IncomingMessage; response: ServerResponse; url: URL; maxBodyBytes: number; keepAliveMs: number };

/**
 * The FluxNode HTTP API (`/api/fluxnode/v1`): one handler for every path under the base,
 * calling `service` as the open-mode caller. The open-mode guards run first, on every
 * call; no `Access-Control-*` header is ever sent. The listener mounts it for paths under
 * `FLUXNODE_API_BASE_PATH`.
 */
export function fluxNodeApiHandler(service: FluxNodeService, options: FluxNodeApiOptions = {}): RequestListener {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;
  return (request, response) => {
    void handle({ service, request, response, url: new URL(request.url ?? "/", "http://127.0.0.1"), maxBodyBytes, keepAliveMs }).catch((error: unknown) => {
      console.error("[FluxIQ] The FluxNode API could not answer a request:", error);
      writeFluxNodeRefusal(response, { code: "internal", message: "FluxIQ could not answer this request." });
    });
  };
}

async function handle(context: Context): Promise<void> {
  const { request, response } = context;
  const guard = checkOpenModeGuards(request);
  if (guard) return writeFluxNodeRefusal(response, guard);
  const route = routeFluxNodePath(context.url.pathname);
  if (route.endpoint === "malformed") return writeFluxNodeRefusal(response, { code: "invalid_request", message: "Malformed request path." });
  if (route.endpoint === "unknown") return writeFluxNodeRefusal(response, { code: "invalid_request", status: 404, message: "There is no such FluxNode endpoint." });
  const allowed: readonly string[] = FLUXNODE_API_METHODS[route.endpoint];
  const method = request.method ?? "GET";
  if (!allowed.includes(method)) return writeFluxNodeRefusal(response, { code: "invalid_request", status: 405, message: `This endpoint takes ${allowed.join(" or ")}.`, headers: { allow: allowed.join(", ") } });
  return dispatch(context, route.endpoint, route);
}

async function dispatch(context: Context, endpoint: FluxNodeApiEndpoint, route: FluxNodeRoute): Promise<void> {
  const { service, response } = context;
  const runId = "runId" in route ? route.runId : undefined;
  const name = "name" in route ? route.name : undefined;
  if (runId !== undefined && !fluxNodeFieldSchemas.id.safeParse(runId).success) return writeFluxNodeRefusal(response, { code: "unknown_run", message: "There is no such run." });
  if (endpoint === "specs") {
    const body = await readBody(context, fluxNodeRegisterSpecRequestSchema, false);
    return body === null ? undefined : send(response, await service.register(CALLER, body));
  }
  if (endpoint === "runs") {
    if (context.request.method === "GET") return listRuns(context);
    const body = await readBody(context, fluxNodeStartRunRequestSchema, false);
    return body === null ? undefined : send(response, await service.start(CALLER, body));
  }
  if (endpoint === "run") return send(response, await service.get(CALLER, runId!));
  if (endpoint === "runEvents") return streamEvents(context, runId!);
  if (endpoint === "runAnswers") {
    const body = await readBody(context, fluxNodeAnswerEventRequestSchema, false);
    return body === null ? undefined : send(response, await service.answer(CALLER, runId!, body));
  }
  if (endpoint === "runStop") {
    const body = await readBody(context, fluxNodeStopRunRequestSchema, true);
    return body === null ? undefined : send(response, await service.stop(CALLER, runId!, body));
  }
  const nameCheck = fluxNodeNameSchema.safeParse(name);
  if (!nameCheck.success) return writeFluxNodeRefusal(response, { code: "unknown_fluxnode", message: "There is no such FluxNode." });
  const body = await readBody(context, fluxNodeExportFlowRequestSchema, true);
  return body === null ? undefined : send(response, await service.exportFlow(CALLER, nameCheck.data, body));
}

async function listRuns(context: Context): Promise<void> {
  const query: Record<string, string> = {};
  for (const [key, value] of context.url.searchParams) query[key] = value;
  const parsed = parseFluxNodeBody(fluxNodeListRunsQuerySchema, query);
  if (!parsed.ok) return writeFluxNodeRefusal(context.response, { code: "invalid_request", message: "The query was not valid.", issues: parsed.issues });
  return send(context.response, await context.service.list(CALLER, parsed.value));
}

async function streamEvents(context: Context, runId: string): Promise<void> {
  const { request, response, url } = context;
  const header = request.headers["last-event-id"];
  const text = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get(FLUXNODE_EVENT_STREAM.afterQuery) ?? "0";
  if (!/^\d{1,15}$/u.test(text.trim())) return writeFluxNodeRefusal(response, { code: "invalid_request", message: "The position to resume after must be an event number." });
  const controller = new AbortController();
  const outcome = await context.service.events(CALLER, runId, Number(text.trim()), controller.signal);
  if (!outcome.ok) return writeFluxNodeRefusal(response, outcome.refusal);
  return streamFluxNodeEvents(response, outcome.value, controller, context.keepAliveMs);
}

/** The parsed body, or null once the refusal is written. An empty body reads as `{}` where `emptyIsObject`. */
async function readBody<T>(context: Context, schema: FluxNodeBodySchema<T>, emptyIsObject: boolean): Promise<T | null> {
  const read = await readFluxNodeJsonBody(context.request, context.maxBodyBytes);
  if (!read.ok) {
    const refusal: FluxNodeHttpRefusal = read.reason === "too_large"
      ? { code: "invalid_request", message: `The request body is larger than ${context.maxBodyBytes} bytes.`, headers: { connection: "close" } }
      : { code: "invalid_request", message: "The request body is not JSON." };
    writeFluxNodeRefusal(context.response, refusal);
    return null;
  }
  const parsed = parseFluxNodeBody(schema, read.empty && emptyIsObject ? {} : read.value);
  if (parsed.ok) return parsed.value;
  writeFluxNodeRefusal(context.response, { code: "invalid_request", message: "The request body was not valid.", issues: parsed.issues });
  return null;
}

function send<T>(response: ServerResponse, outcome: FluxNodeServiceOutcome<T>): void {
  if (outcome.ok) return writeFluxNodeJson(response, 200, outcome.value);
  writeFluxNodeRefusal(response, outcome.refusal);
}
