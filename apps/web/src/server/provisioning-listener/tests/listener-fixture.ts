import { randomBytes } from "node:crypto";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import os from "node:os";
import path from "node:path";
import { IdentityAccessService } from "fluxiq/identity-access";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type PlatformServices } from "fluxiq/platform";
import { startProvisioningListener } from "../start-provisioning-listener";
import type { ProvisioningListenerHandle, ProvisioningListenerOptions, ProvisioningListenerServices } from "../types";
import { MemoryRecordRepository } from "./memory-record-repository";

// Test support for the private listener: real platform services over memory
// repositories and a real identity service (weak test KDF), a run-scoped
// token file, a settable clock, and a raw `node:http` client so a test sets
// exactly the headers it means to (an Origin, no Authorization). Tokens are
// random per run and never printed.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

export type TestClock = { nowMs: number };

export type ListenerReply = {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
  json: unknown;
};

export type ListenerHarness = {
  handle: ProvisioningListenerHandle;
  services: PlatformServices;
  email: MemoryEmailSender;
  token: string;
  tokenFile: string;
  clock: TestClock;
  logs: string[];
  post(operation: string, body: unknown, options?: PostOptions): Promise<ListenerReply>;
  /** Rewrites the token file and moves its modification time, as a rotation does. */
  writeTokens(tokens: readonly string[]): Promise<void>;
  close(): Promise<void>;
};

export type PostOptions = {
  token?: string | null;
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  rawBody?: string;
};

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createRunDirectory(): Promise<{ directory: string; remove(): Promise<void> }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-provisioning-listener-"));
  return { directory, remove: () => rm(directory, { recursive: true, force: true }) };
}

export async function createTestServices(): Promise<{ services: PlatformServices; email: MemoryEmailSender }> {
  const repository = new MemoryRecordRepository();
  const email = new MemoryEmailSender();
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity: new IdentityAccessService({ passwordKdf: WEAK_KDF }),
    email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" }
  });
  return { services, email };
}

export type HarnessOptions = Partial<Pick<ProvisioningListenerOptions, "allowedCidrs" | "rateLimit" | "drainMs">> & {
  tokens?: readonly string[];
  getServices?: () => Promise<ProvisioningListenerServices>;
};

export async function startListenerHarness(options: HarnessOptions = {}): Promise<ListenerHarness> {
  const run = await createRunDirectory();
  const tokenFile = path.join(run.directory, "provisioning-token");
  const token = newToken();
  let mtimeSeconds = Math.floor(Date.now() / 1000);
  const writeTokens = async (tokens: readonly string[]) => {
    await writeFile(tokenFile, `${tokens.join("\n")}\n`, "utf8");
    mtimeSeconds += 60;
    await utimes(tokenFile, mtimeSeconds, mtimeSeconds);
  };
  await writeTokens(options.tokens ?? [token]);
  const { services, email } = await createTestServices();
  const clock: TestClock = { nowMs: 1_000_000 };
  const logs: string[] = [];
  const listenerOptions: ProvisioningListenerOptions = {
    host: "127.0.0.1",
    port: 0,
    tokenFile,
    reservedPorts: [],
    getServices: options.getServices ?? (async () => services),
    log: (line) => logs.push(line),
    now: () => clock.nowMs
  };
  if (options.allowedCidrs !== undefined) listenerOptions.allowedCidrs = options.allowedCidrs;
  if (options.rateLimit !== undefined) listenerOptions.rateLimit = options.rateLimit;
  if (options.drainMs !== undefined) listenerOptions.drainMs = options.drainMs;
  const handle = await startProvisioningListener(listenerOptions);
  return {
    handle,
    services,
    email,
    token,
    tokenFile,
    clock,
    logs,
    post: (operation, body, postOptions = {}) => postToListener(handle, operation, body, postOptions.token === undefined ? { ...postOptions, token } : postOptions),
    writeTokens,
    close: async () => {
      await handle.close();
      await run.remove();
    }
  };
}

/** One request with exactly the given headers; `token: null` sends no Authorization. */
export function postToListener(handle: ProvisioningListenerHandle, operation: string, body: unknown, options: PostOptions): Promise<ListenerReply> {
  const payload = options.rawBody ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json", ...options.headers };
  if (options.token !== undefined && options.token !== null) headers.authorization = `Bearer ${options.token}`;
  headers["content-length"] = String(Buffer.byteLength(payload, "utf8"));
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: handle.address.host, port: handle.address.port, method: options.method ?? "POST", path: options.path ?? `/provisioning/${operation}`, headers, agent: false }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, text, json: text === "" ? null : JSON.parse(text) });
      });
      incoming.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

/** A createAccount input for the website's sign-up. */
export function signUpInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { requestId: "req-signup-1", email: "Person@Example.test", displayName: "A Person", policies: ["FluxIQUserAccess"], workspace: "new", ...overrides };
}
