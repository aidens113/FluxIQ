// The HTTP half of the client: one place that adds the session's headers, retries a
// 401 once with a fresh session, turns an error body into a typed error, and checks
// every answer against the contracts before the program sees it.

import { fluxNodeErrorBodySchema } from "@fluxiq/contracts/fluxnode";
import type { ZodType, ZodTypeDef } from "zod";
import { FluxNodeApiError, SdkError } from "../errors/index.ts";
import type { Session } from "../session/index.ts";

export type TransportOptions = { baseUrl: string; session: Session; fetch: typeof fetch };

export type JsonCall<T> = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  /** The contracts' schema for the answer. */
  answer: ZodType<T, ZodTypeDef, unknown>;
};

export type Transport = {
  json<T>(call: JsonCall<T>): Promise<T>;
  /** An open response, for the event stream; a refusal is thrown as `json` would. */
  open(path: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response>;
};

async function send(options: TransportOptions, method: string, path: string, extra: Record<string, string>, body: string | undefined, signal: AbortSignal | undefined, retried: boolean): Promise<Response> {
  const headers = { ...(await options.session.headers()), ...extra };
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = body;
  if (signal !== undefined) init.signal = signal;
  let response: Response;
  try {
    response = await options.fetch(new URL(path, options.baseUrl), init);
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new SdkError("connection", `Could not reach the engine at ${options.baseUrl}: ${error instanceof Error ? error.message : "unreachable"}.`, { cause: error, hint: "Start it with `fluxiq dev`, or pass the engine's address as the url option." });
  }
  if (response.status === 401 && !retried) {
    options.session.invalidate();
    return send(options, method, path, extra, body, signal, true);
  }
  return response;
}

async function refusal(response: Response): Promise<FluxNodeApiError> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return new FluxNodeApiError({ status: response.status, apiCode: `http_${response.status}`, message: `The engine answered ${response.status} with something that is not JSON (${error instanceof Error ? error.message : "unreadable"}).` });
  }
  const parsed = fluxNodeErrorBodySchema.safeParse(body);
  if (!parsed.success) {
    const loose = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof loose?.code === "string" ? loose.code : `http_${response.status}`;
    const message = typeof loose?.message === "string" ? loose.message : `The engine answered ${response.status}.`;
    return new FluxNodeApiError({ status: response.status, apiCode: code, message });
  }
  const { code, message, issues, retryAfterMs } = parsed.data.error;
  const details: ConstructorParameters<typeof FluxNodeApiError>[0] = { status: response.status, apiCode: code, message };
  if (issues !== undefined) details.issues = issues;
  if (retryAfterMs !== undefined) details.retryAfterMs = retryAfterMs;
  return new FluxNodeApiError(details);
}

/** A transport over `options`. */
export function createTransport(options: TransportOptions): Transport {
  return {
    async json<T>(call: JsonCall<T>): Promise<T> {
      const body = call.body === undefined ? undefined : JSON.stringify(call.body);
      const extra: Record<string, string> = { accept: "application/json" };
      if (body !== undefined) extra["content-type"] = "application/json";
      const response = await send(options, call.method, call.path, extra, body, call.signal, false);
      if (!response.ok) throw await refusal(response);
      const parsed = call.answer.safeParse(await response.json());
      if (!parsed.success) {
        const where = parsed.error.issues.map((issue) => `${issue.path.join("/")}: ${issue.message}`).join("; ");
        throw new SdkError("protocol", `The engine's answer to ${call.method} ${call.path} does not match the FluxNode API: ${where}`);
      }
      return parsed.data;
    },
    async open(path, headers, signal) {
      const response = await send(options, "GET", path, headers, undefined, signal, false);
      if (!response.ok) throw await refusal(response);
      return response;
    }
  };
}
