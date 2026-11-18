import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage } from "../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../framework/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../index.ts";
import type { SecretKeyUsePrincipal } from "../../secret-keys/index.ts";

export const RUNTIME_PASSWORD = "admin";
export const RUNTIME_KEY_VALUE = "dummy-provider-key-value-for-runtime";
const CLIENT_ID = "extension.runtime";
type Login = Awaited<ReturnType<GlobalProgramRuntime["identityAccess"]["authenticate"]>>;
export type RuntimeClient = { gatewaySessionId: string; token: string };
export type RuntimeClientPrincipal = Extract<SecretKeyUsePrincipal, { kind: "client" }>;

export function runtimeClientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

/** Real composition and disk stores. Only authentication obtains the panel session; no model-key unlock is called. */
export class RuntimeAccessFixture {
  private readonly open = new Set<GlobalProgramRuntime>();
  private constructor(readonly root: string) {}

  static async create(): Promise<RuntimeAccessFixture> {
    return new RuntimeAccessFixture(await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-access-")));
  }

  /** `modelProvidersEnabled` wires the host's real chat and Flow model paths; their provider calls go to whatever `fetch` the test stubs. */
  boot(options: { modelProvidersEnabled?: boolean } = {}): GlobalProgramRuntime {
    const runtime = createGlobalProgramRuntime(pathsAt(this.root), { modelProvidersEnabled: options.modelProvidersEnabled === true, iam: { profile: "local" } });
    this.open.add(runtime);
    return runtime;
  }

  async close(runtime: GlobalProgramRuntime): Promise<void> {
    if (!this.open.delete(runtime)) return;
    runtime.detach();
    try { await runtime.automationStudio.close(); } finally { runtime.secretKeys.close(); }
  }

  async dispose(): Promise<void> {
    try { for (const runtime of [...this.open]) await this.close(runtime); }
    finally { await rm(this.root, { recursive: true, force: true }); }
  }

  async signIn(runtime: GlobalProgramRuntime, username = "admin", password = RUNTIME_PASSWORD): Promise<Login> {
    return await runtime.identityAccess.authenticate({ username, password });
  }

  async createKey(runtime: GlobalProgramRuntime, login: Login, password = RUNTIME_PASSWORD) {
    return await runtime.secretKeys.createKey({
      name: "Model", kind: "llm", provider: "Anthropic", value: RUNTIME_KEY_VALUE,
      authorizationPassword: password, createdBy: login.user.id,
      actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs }
    });
  }

  async pair(runtime: GlobalProgramRuntime, login: Login): Promise<RuntimeClient> {
    const session = runtime.clientGateway.connect();
    await runtime.clientGateway.receive(session.sessionId, runtimeClientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
    const code = runtime.clientGateway.snapshot().pairings.find(pairing => pairing.requestedBySessionId === session.sessionId)?.pairingCode;
    if (!code) throw new Error("The isolated browser did not request approval.");
    await runtime.clientGateway.approvePairing(code, { approvedByUserId: login.user.id, approvedBySessionId: login.session.id });
    return { gatewaySessionId: session.sessionId, token: tokenFrom(runtime, session.sessionId) };
  }

  async reconnect(runtime: GlobalProgramRuntime, token: string): Promise<RuntimeClient> {
    const session = runtime.clientGateway.connect();
    await runtime.clientGateway.receive(session.sessionId, runtimeClientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
    return { gatewaySessionId: session.sessionId, token: tokenFrom(runtime, session.sessionId) };
  }

  /** Derive the principal only from an actual authenticated ready gateway session. */
  async principal(runtime: GlobalProgramRuntime, client: RuntimeClient, userId: string): Promise<RuntimeClientPrincipal> {
    const session = await runtime.clientGateway.authorizeToken(client.token);
    if (!session || session.sessionId !== client.gatewaySessionId || session.status !== "ready" || session.operatorUserId !== userId || !session.trustedClientId || session.managedHostId) throw new Error("The isolated client is not currently authenticated.");
    return { kind: "client", userId, trustedClientId: session.trustedClientId };
  }

  async reveal(runtime: GlobalProgramRuntime, principal: SecretKeyUsePrincipal, keyId: string): Promise<string> {
    const authorization = await runtime.secretKeys.access.createUseAuthorization({ id: keyId, principal });
    try { return (await runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).value; }
    finally { runtime.secretKeys.revokeRevealAuthorization(authorization.authorizationId); }
  }

  async checkpoint(): Promise<number> {
    const files = await this.databases();
    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        const database = new sqlite3.Database(path.toNamespacedPath(file));
        database.exec("pragma wal_checkpoint(FULL)", error => database.close(closeError => error || closeError ? reject(error ?? closeError) : resolve()));
      });
    }
    return files.length;
  }

  async databasesHolding(text: string): Promise<string[]> {
    const files = await this.databases();
    const holding: string[] = [];
    for (const file of files) if ((await readFile(file)).includes(text)) holding.push(file);
    return holding;
  }

  private async databases(): Promise<string[]> {
    const entries = await readdir(this.root, { recursive: true, withFileTypes: true });
    return entries.filter(entry => entry.isFile() && entry.name.endsWith(".sqlite")).map(entry => path.join(entry.parentPath, entry.name));
  }
}

function tokenFrom(runtime: GlobalProgramRuntime, sessionId: string): string {
  const ready = runtime.clientGateway.outbound(sessionId).filter(message => message.type === "server.session_ready").at(-1);
  const token = (ready?.payload as { token?: string } | undefined)?.token;
  if (!token) throw new Error("The isolated browser was not issued a credential.");
  return token;
}

function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  return {
    root, fluxiq, config: path.join(fluxiq, "config.json"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"), domains: path.join(fluxiq, "domains"),
    domainPrograms: path.join(fluxiq, "domain-programs"), domainInputs: path.join(fluxiq, "domain-inputs"), domainOutputs: path.join(fluxiq, "domain-outputs"),
    // Where projects and their chats live, so a runtime booted here can hold a conversation.
    recordings: path.join(fluxiq, "artifacts", "automation-studio")
  } as FluxIQHostPaths;
}
