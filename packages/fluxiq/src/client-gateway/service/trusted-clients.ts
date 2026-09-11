import { createHash, randomUUID } from "node:crypto";
import type { ClientGatewayTrustedClient, ClientGatewayTrustedClientView } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "./config.ts";

/**
 * Owns durable client trust: the trusted-client map, the token-hash index that
 * resolves a bearer token to it, and the store both are persisted to. Every
 * mutation that persists rolls its in-memory change back if the store rejects,
 * so a failed write never leaves the index disagreeing with the map.
 */
export class ClientGatewayTrustedClientRegistry {
  private readonly clients = new Map<string, ClientGatewayTrustedClient>();
  private readonly idByTokenHash = new Map<string, string>();
  private readonly config: ClientGatewayConfig;
  private readonly loaded: Promise<void>;
  private loadError: unknown;

  constructor(config: ClientGatewayConfig) {
    this.config = config;
    this.loaded = this.load().catch((error: unknown) => {
      this.loadError = error;
    });
  }

  async ready(): Promise<void> {
    await this.loaded;
    if (this.loadError) throw this.loadError;
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  isActive(client: ClientGatewayTrustedClient): boolean {
    return !client.revokedAt && client.expiresAt > this.config.now();
  }

  /** The trusted-client view callers outside the gateway see: no token hash. */
  toView(client: ClientGatewayTrustedClient): ClientGatewayTrustedClientView {
    const { tokenHash: _tokenHash, ...view } = client;
    const status = client.revokedAt ? "revoked" : client.expiresAt <= this.config.now() ? "expired" : "active";
    return { ...view, status };
  }

  get(trustedClientId: string): ClientGatewayTrustedClient | undefined {
    return this.clients.get(trustedClientId);
  }

  /** The trusted client a raw bearer token maps to, active or not. */
  resolveByToken(token: string): ClientGatewayTrustedClient | undefined {
    const trustedClientId = this.idByTokenHash.get(this.hashToken(token));
    return trustedClientId ? this.clients.get(trustedClientId) : undefined;
  }

  list(): ClientGatewayTrustedClient[] {
    return [...this.clients.values()];
  }

  size(): number {
    return this.clients.size;
  }

  /**
   * Mint durable trust for a freshly paired session. Returns the one-time token
   * with the client; `trustedClient.approvedAt` is the single timestamp the
   * caller should reuse for the pairing and the session.
   */
  async register(input: {
    clientId: string;
    clientType: ClientGatewayTrustedClient["clientType"];
    name: string;
    approvedByUserId: string;
  }): Promise<{ trustedClient: ClientGatewayTrustedClient; token: string }> {
    const token = this.config.createToken();
    const now = this.config.now();
    const trustedClient: ClientGatewayTrustedClient = {
      trustedClientId: randomUUID(),
      clientId: input.clientId,
      clientType: input.clientType,
      name: input.name,
      tokenHash: this.hashToken(token),
      approvedByUserId: input.approvedByUserId,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      expiresAt: now + this.config.trustedClientTtlMs
    };
    this.clients.set(trustedClient.trustedClientId, trustedClient);
    this.idByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
    try {
      await this.persist();
    } catch (error) {
      this.clients.delete(trustedClient.trustedClientId);
      this.idByTokenHash.delete(trustedClient.tokenHash);
      throw error;
    }
    return { trustedClient, token };
  }

  /** Issue a replacement token on reconnect, returning the new one-time token. */
  async rotateToken(trustedClient: ClientGatewayTrustedClient): Promise<string> {
    const previousHash = trustedClient.tokenHash;
    const previousUpdatedAt = trustedClient.updatedAt;
    const previousLastUsedAt = trustedClient.lastUsedAt;
    const token = this.config.createToken();
    const now = this.config.now();
    trustedClient.tokenHash = this.hashToken(token);
    trustedClient.updatedAt = now;
    trustedClient.lastUsedAt = now;
    this.idByTokenHash.delete(previousHash);
    this.idByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
    try {
      await this.persist();
    } catch (error) {
      this.idByTokenHash.delete(trustedClient.tokenHash);
      trustedClient.tokenHash = previousHash;
      trustedClient.updatedAt = previousUpdatedAt;
      trustedClient.lastUsedAt = previousLastUsedAt;
      this.idByTokenHash.set(previousHash, trustedClient.trustedClientId);
      throw error;
    }
    return token;
  }

  async revoke(trustedClient: ClientGatewayTrustedClient, reason: string): Promise<void> {
    const now = this.config.now();
    const previousUpdatedAt = trustedClient.updatedAt;
    trustedClient.revokedAt = now;
    trustedClient.revocationReason = reason;
    trustedClient.updatedAt = now;
    this.idByTokenHash.delete(trustedClient.tokenHash);
    try {
      await this.persist();
    } catch (error) {
      delete trustedClient.revokedAt;
      delete trustedClient.revocationReason;
      trustedClient.updatedAt = previousUpdatedAt;
      this.idByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
      throw error;
    }
  }

  private async load(): Promise<void> {
    if (!this.config.trustedClientStore) return;
    const clients = await this.config.trustedClientStore.load();
    for (const client of clients) {
      if (!client?.trustedClientId || !client.clientId || !client.tokenHash || !client.approvedByUserId) continue;
      this.clients.set(client.trustedClientId, { ...client });
      if (this.isActive(client)) this.idByTokenHash.set(client.tokenHash, client.trustedClientId);
    }
  }

  private async persist(): Promise<void> {
    if (!this.config.trustedClientStore) return;
    await this.config.trustedClientStore.save(this.list().map((client) => ({ ...client })));
  }
}
