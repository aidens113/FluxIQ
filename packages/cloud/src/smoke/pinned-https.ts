import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request } from "node:https";

/** One HTTPS answer: status, the session values the server set, and the body as text. */
export type PinnedAnswer = { status: number; sessionPairs: string[]; body: string };

/** One HTTPS call: method, path, an optional JSON body (as text), and the session pairs to send. */
export type PinnedCall = { method: "GET" | "POST"; path: string; body?: string; session?: readonly string[] };

/**
 * An HTTPS client for the smoke that trusts only the deployment's exported
 * root certificate (no system authorities, no verification turned off), and
 * reaches a `.localhost` name on the loopback address, as RFC 6761 says it
 * resolves, without asking DNS. Requests carry the public origin as their
 * Origin, as the panel's same-site checks expect of its own pages.
 */
export function pinnedHttps(publicOrigin: string, authority: string) {
  const origin = new URL(publicOrigin);
  return async (call: PinnedCall): Promise<PinnedAnswer> => {
    const body = call.body;
    const headers = new Map<string, string>([["origin", origin.origin], ["accept", "application/json"]]);
    if (body !== undefined) headers.set("content-type", "application/json");
    if (call.session !== undefined && call.session.length > 0) headers.set("cookie", call.session.join("; "));
    return new Promise((resolve, reject) => {
      const outgoing = request({
        host: origin.hostname,
        port: origin.port === "" ? 443 : Number(origin.port),
        servername: origin.hostname,
        path: call.path,
        method: call.method,
        headers: Object.fromEntries(headers),
        ca: authority,
        lookup: loopbackForLocalhost
      }, (incoming) => {
        let text = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => { text += chunk; });
        incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, sessionPairs: sessionPairsOf(incoming.rawHeaders), body: text }));
        incoming.on("error", reject);
      });
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  };
}

function sessionPairsOf(rawHeaders: readonly string[]): string[] {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    if ((rawHeaders[index] ?? "").toLowerCase() !== "set-cookie") continue;
    const pair = (rawHeaders[index + 1] ?? "").split(";")[0]?.trim() ?? "";
    if (pair.includes("=")) pairs.push(pair);
  }
  return pairs;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function loopbackForLocalhost(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
    else callback(null, "127.0.0.1", 4);
    return;
  }
  dnsLookup(hostname, options, callback);
}
