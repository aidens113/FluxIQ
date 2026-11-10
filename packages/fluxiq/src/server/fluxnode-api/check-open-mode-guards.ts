import type { IncomingMessage } from "node:http";
import type { FluxNodeHttpRefusal } from "./http-refusal.ts";

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/iu;
const LOOPBACK_ADDRESS = /^(?:127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/iu;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;.*)?$/iu;

/**
 * The open-mode guards (plan, K4 and K8), run before anything else on every FluxNode
 * call. With no key, what keeps a web page or another machine from driving the owner's
 * browser is that the call is on loopback, names a loopback host (no DNS rebinding),
 * carries no `Origin` (a page's request always has one), is not marked cross-site, names
 * its client in `FluxIQ-Client`, and posts JSON (a form cannot). Answers the refusal, or
 * null when the call passes.
 */
export function checkOpenModeGuards(request: IncomingMessage): FluxNodeHttpRefusal | null {
  const address = request.socket.remoteAddress;
  if (address === undefined || !LOOPBACK_ADDRESS.test(address)) return forbidden("FluxNode calls are accepted from this computer only.");
  const host = singleHeader(request, "host");
  if (host === undefined || !LOOPBACK_HOST.test(host)) return forbidden("FluxNode calls must name localhost, 127.0.0.1 or [::1] as the host.");
  if (request.headers.origin !== undefined) return forbidden("FluxNode calls from a web page are refused.");
  const fetchSite = singleHeader(request, "sec-fetch-site");
  if (fetchSite !== undefined && fetchSite !== "none") return forbidden("FluxNode calls from a web page are refused.");
  const client = singleHeader(request, "fluxiq-client");
  if (client === undefined || client.trim() === "") return forbidden("Name the calling program in a FluxIQ-Client header.");
  if (request.method === "POST") {
    const contentType = singleHeader(request, "content-type");
    if (contentType === undefined || !JSON_CONTENT_TYPE.test(contentType)) return { code: "invalid_request", message: "Send POST bodies as content-type: application/json." };
  }
  return null;
}

function forbidden(message: string): FluxNodeHttpRefusal {
  return { code: "forbidden", message };
}

function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}
