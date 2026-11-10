// Test support: raw HTTP calls to a loopback listener, because `fetch` forbids setting
// `Host` and `Origin`, which the guards read.
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";

export type ApiReply = { status: number; headers: IncomingHttpHeaders; text: string; json: () => unknown };

export type ApiCall = { port: number; method?: string; path: string; headers?: Record<string, string>; body?: string; withDefaults?: boolean };

const DEFAULT_HEADERS: Record<string, string> = { "fluxiq-client": "sdk" };

export function headersFor(call: ApiCall): Record<string, string> {
  const post = (call.method ?? "GET") === "POST";
  return { ...(call.withDefaults === false ? {} : DEFAULT_HEADERS), ...(post && call.withDefaults !== false ? { "content-type": "application/json" } : {}), ...call.headers };
}

export function openApiCall(call: ApiCall, onResponse: (response: IncomingMessage) => void): { abort: () => void } {
  const req = httpRequest({ host: "127.0.0.1", port: call.port, method: call.method ?? "GET", path: call.path, headers: headersFor(call) }, onResponse);
  req.on("error", () => undefined);
  req.end(call.body);
  return { abort: () => req.destroy() };
}

export function callApi(call: ApiCall): Promise<ApiReply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: call.port, method: call.method ?? "GET", path: call.path, headers: headersFor(call) }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode ?? 0, headers: response.headers, text, json: () => JSON.parse(text) as unknown });
      });
    });
    req.on("error", reject);
    req.end(call.body);
  });
}
