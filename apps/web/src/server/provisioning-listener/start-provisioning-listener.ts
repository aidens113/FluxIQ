import { createServer, type Server } from "node:http";
import { assertPrivateBind } from "./bind";
import { ProvisioningListenerConfigError } from "./provisioning-listener-config-error";
import { createProvisioningRequestHandler, SlidingWindowRateLimiter } from "./request";
import { DEFAULT_ALLOWED_CIDRS, SourceAllowlist } from "./source";
import { ProvisioningTokenVerifier } from "./token";
import type { ProvisioningListenerHandle, ProvisioningListenerOptions } from "./types";

const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };
const DEFAULT_DRAIN_MS = 10_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const MAX_HEADER_BYTES = 16 * 1024;

/**
 * Starts the private provisioning listener (hosted production plan, Account
 * Provisioning API): a `node:http` server of its own, never the panel's or
 * the client gateway's port, answering `POST /provisioning/<operation>` for
 * callers from loopback or private sources with the Bearer token. Refuses to
 * start, with a `ProvisioningListenerConfigError` that holds no secret, on a
 * reserved port, a public or invalid allowlist entry, or an unusable token
 * file. Resolves once it is listening.
 */
export async function startProvisioningListener(options: ProvisioningListenerOptions): Promise<ProvisioningListenerHandle> {
  assertPrivateBind(options.port, options.reservedPorts);
  const allowlist = SourceAllowlist.fromCidrs(options.allowedCidrs ?? DEFAULT_ALLOWED_CIDRS);
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.info(line));
  const tokens = await ProvisioningTokenVerifier.open(options.tokenFile, { now, warn: log });
  const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const handler = createProvisioningRequestHandler({
    allowlist,
    rateLimiter: new SlidingWindowRateLimiter(rateLimit, now),
    tokens,
    getServices: options.getServices,
    log,
    retryAfterSeconds: Math.max(1, Math.ceil(rateLimit.windowMs / 1000))
  });
  const server = createServer({ headersTimeout: HEADERS_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS, keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS, maxHeaderSize: MAX_HEADER_BYTES }, handler);
  server.maxHeadersCount = 64;
  const port = await listen(server, options.host, options.port);
  server.on("error", (error: NodeJS.ErrnoException) => log(`[FluxIQ] The provisioning listener failed (${error.code ?? error.name}).`));
  let closing: Promise<void> | null = null;
  return {
    address: { host: options.host, port },
    close: () => {
      closing ??= drain(server, options.drainMs ?? DEFAULT_DRAIN_MS);
      return closing;
    }
  };
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      reject(new ProvisioningListenerConfigError(`The provisioning listener could not listen on ${host}:${port} (${error.code ?? error.name}).`));
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new ProvisioningListenerConfigError(`The provisioning listener on ${host}:${port} reported no TCP address.`));
        return;
      }
      resolve(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/** Stops accepting, drops idle keep-alive connections, and cuts the rest once `drainMs` has passed. */
function drain(server: Server, drainMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cut = setTimeout(() => server.closeAllConnections(), drainMs);
    cut.unref();
    server.close((error) => {
      clearTimeout(cut);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}
