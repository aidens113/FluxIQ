import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { FLUXNODE_API_BASE_PATH } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeService } from "../../framework/automation-service/service/fluxnode/index.ts";
import { fluxNodeApiHandler } from "../fluxnode-api/index.ts";
import { handleProgramRequest, type ProgramRouteContext, type ProgramRouteResponse } from "../program-route/index.ts";
import { handleManagedClientRequest } from "../client-gateway-routes/index.ts";

const PROGRAM_PATH = /^\/api\/programs\/([^/]+)\/([^/]+)$/u;

/**
 * The HTTP side of a server without Next.js: `/api/programs/<programId>/<endpoint>`
 * answered by the same handler the web panel mounts, plus, when `fluxNodes` is given,
 * the FluxNode API under `/api/fluxnode/v1` (its own open-mode guards); nothing else (404).
 *
 * No cookie is read: the panel's login, and so a person's session, is the web
 * panel's, so here every caller is a paired client with its bearer token, held
 * to the same allowlist, narrowing, IAM and domain gate. With no cookie read,
 * the panel's cross-site guard for cookie-carrying writes has nothing to guard.
 */
export function programApiListener(context: ProgramRouteContext, fluxNodes?: FluxNodeService): RequestListener {
  const fluxNodeApi = fluxNodes ? fluxNodeApiHandler(fluxNodes) : undefined;
  return (request, response) => {
    if (fluxNodeApi && isFluxNodePath(request)) {
      fluxNodeApi(request, response);
      return;
    }
    void answer(request, context).then(
      (answered) => write(response, answered),
      (error: unknown) => {
        console.error("[FluxIQ] The program API could not answer a request:", error);
        write(response, { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "FluxIQ could not answer this request." }) });
      }
    );
  };
}

/** True for the FluxNode API's base path and everything under it. */
function isFluxNodePath(request: IncomingMessage): boolean {
  const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
  return pathname === FLUXNODE_API_BASE_PATH || pathname.startsWith(`${FLUXNODE_API_BASE_PATH}/`);
}

async function answer(request: IncomingMessage, context: ProgramRouteContext): Promise<ProgramRouteResponse> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const managed = await handleManagedClientRequest({ url: url.href, method: request.method ?? "GET",
    headers: new Headers(Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((entry) => [key, entry] as [string, string]))),
    arrayBuffer: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk as Buffer);
      const bytes = Buffer.concat(chunks);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    }
  }, context.fluxiq);
  if (managed) return managed;
  const match = PROGRAM_PATH.exec(url.pathname);
  if (!match) return plain(404, "Not found");
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "POST") return { ...plain(405, "Method not allowed"), headers: { "content-type": "application/json", allow: "GET, POST" } };
  const segments = decodeSegments(match[1]!, match[2]!);
  if (!segments) return plain(400, "Malformed request path.");
  return handleProgramRequest({
    method,
    url: url.href,
    programId: segments.programId,
    endpoint: segments.endpoint,
    sessionId: undefined,
    authorization: headerValue(request.headers.authorization),
    readJson: () => readJson(request)
  }, context);
}

function decodeSegments(programId: string, endpoint: string): { programId: string; endpoint: string } | null {
  try {
    return { programId: decodeURIComponent(programId), endpoint: decodeURIComponent(endpoint) };
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

/** The body as JSON, or undefined when it is empty or does not parse, as the web panel's `request.json().catch(() => undefined)` reads it. */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(", ") : value;
}

function plain(status: number, error: string): ProgramRouteResponse {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error }) };
}

function write(response: ServerResponse, answered: ProgramRouteResponse): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(answered.status, answered.headers);
  response.end(answered.body);
}
