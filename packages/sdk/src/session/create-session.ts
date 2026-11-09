// Proves a key to the engine and keeps the short session it returns (keys design,
// section 3). The SDK renews at 80% of a session's life, and once more on a 401. The
// server half of this exchange is P3b; these tests run against a fake that follows
// the design.

import type { ResolvedCredential } from "../keys/index.ts";
import { signProof } from "../keys/index.ts";
import { FluxNodeApiError, SdkError } from "../errors/index.ts";
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from "./client-header.ts";
import type { Session } from "./session.ts";

export type SessionOptions = {
  baseUrl: string;
  /** `undefined`: open mode, calls carry no credential. */
  credential: ResolvedCredential | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

type Live = { token: string; refreshAt: number };

const RENEW_AT = 0.8;
const SESSION_PATH = "/api/keys/session";
const DISCOVERY_PATH = "/.well-known/fluxiq";

function asEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return Date.parse(value);
  return undefined;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new SdkError("protocol", `The engine answered ${response.status} with something that is not JSON.`, { cause: error });
  }
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

/** A session for `options`: open mode adds only the client header; a key proves itself first. */
export function createSession(options: SessionOptions): Session {
  const now = options.now ?? (() => Date.now());
  const base: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
  let live: Live | undefined;
  let pending: Promise<Live | undefined> | undefined;
  let offsetMs = 0;
  let instanceId: string | undefined;
  let openByEngine = false;

  async function discover(): Promise<string> {
    if (instanceId !== undefined) return instanceId;
    const response = await options.fetch(new URL(DISCOVERY_PATH, options.baseUrl), { headers: base });
    const body = await readBody(response);
    const instance = body.instance as { id?: unknown } | undefined;
    if (!response.ok || typeof instance?.id !== "string") {
      throw new SdkError("protocol", `The engine at ${options.baseUrl} did not say its instance id at ${DISCOVERY_PATH}, which a key proof is addressed to.`);
    }
    instanceId = instance.id;
    return instanceId;
  }

  async function prove(credential: ResolvedCredential, retried: boolean): Promise<Live | undefined> {
    const audience = `${new URL(options.baseUrl).origin}#${await discover()}`;
    const started = now();
    const proof = signProof({ key: credential.key, purpose: "session", audience, payload: "{}", now: new Date(started + offsetMs) });
    const response = await options.fetch(new URL(SESSION_PATH, options.baseUrl), { method: "POST", headers: { ...base, "content-type": "application/json" }, body: JSON.stringify(proof) });
    const body = await readBody(response);
    if (response.ok && typeof body.sessionToken === "string") {
      const expiresAt = asEpochMs(body.expiresAt) ?? started + 3_600_000;
      return { token: body.sessionToken, refreshAt: started + (expiresAt - (asEpochMs(body.serverTime) ?? started)) * RENEW_AT };
    }
    const error = (body.error ?? {}) as { code?: unknown; message?: unknown; serverTime?: unknown };
    const code = typeof error.code === "string" ? error.code : `http_${response.status}`;
    const serverTime = asEpochMs(error.serverTime ?? body.serverTime);
    if (code === "key.clock_skew" && serverTime !== undefined && !retried) {
      offsetMs = serverTime - started;
      return prove(credential, true);
    }
    if (response.status === 404 && !credential.explicit) {
      openByEngine = true;
      return undefined;
    }
    const message = typeof error.message === "string" ? error.message : `The engine refused the key ${credential.key.keyId} (${credential.key.source}).`;
    throw new FluxNodeApiError({ status: response.status, apiCode: code, message });
  }

  async function renew(credential: ResolvedCredential): Promise<Live | undefined> {
    try {
      live = await prove(credential, false);
      return live;
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw new SdkError("connection", `Could not reach the engine at ${options.baseUrl}: ${error instanceof Error ? error.message : "unreachable"}.`, { cause: error, hint: "Start it with `fluxiq dev`, or pass the engine's address as the url option." });
    }
  }

  return {
    async headers() {
      const credential = options.credential;
      if (credential === undefined || openByEngine) return base;
      if (live === undefined || now() >= live.refreshAt) {
        pending ??= renew(credential).finally(() => {
          pending = undefined;
        });
        await pending;
      }
      return live === undefined ? base : { ...base, authorization: `Bearer ${live.token}` };
    },
    invalidate() {
      live = undefined;
    }
  };
}
