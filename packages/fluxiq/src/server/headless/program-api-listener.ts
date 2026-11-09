import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { handleProgramRequest, type ProgramRouteContext, type ProgramRouteResponse } from "../program-route/index.ts";

const PROGRAM_PATH = /^\/api\/programs\/([^/]+)\/([^/]+)$/u;

/**
 * The HTTP side of a server without Next.js: `/api/programs/<programId>/<endpoint>`
 * answered by the same handler the web panel mounts, and nothing else (404).
 *
 * No cookie is read: the panel's login, and so a person's session, is the web
 * panel's, so here every caller is a paired client with its bearer token, held
 * to the same allowlist, narrowing, IAM and domain gate. With no cookie read,
 * the panel's cross-site guard for cookie-carrying writes has nothing to guard.
 */
export function programApiListener(context: ProgramRouteContext): RequestListener {
  return (request, response) => {
    void answer(request, context).then(
      (answered) => write(response, answered),
      (error: unknown) => {
        console.error("[FluxIQ] The program API could not answer a request:", error);
        write(response, { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "FluxIQ could not answer this request." }) });
      }
    );
  };
}

async function answer(request: IncomingMessage, context: ProgramRouteContext): Promise<ProgramRouteResponse> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
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
