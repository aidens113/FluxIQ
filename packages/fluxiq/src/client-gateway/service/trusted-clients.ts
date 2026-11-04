import { createHash, randomUUID } from "node:crypto";
import type { ClientGatewayTrustedClient, ClientGatewayTrustedClientView } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "./config.ts";

/** How often a client in steady use has its credential's life extended and stored: its next message would do, so this only saves writes. */
const RENEW_EVERY_MS = 24 * 60 * 60_000;

/** The fields a rotation or a renewal changes, kept so a store that refuses the write can put them back. */
type LifetimeFields = Pick<ClientGatewayTrustedClient, "tokenHash" | "previousTokenHash" | "previousValidUntil" | "updatedAt" | "lastUsedAt" | "expiresAt">;

/**
 * Owns durable client trust: the trusted-client map, the token-hash index that
 * resolves a bearer token to it, and the store both are persisted to. Every
 * mutation that persists rolls its in-memory change back if the store rejects,
 * so a failed write never leaves the index disagreeing with the map.
 *
 * **A credential's life slides.** It lasts `trustedClientTtlMs` from its last use, so
 * a browser in regular use never pairs again.
 *
 * **A rotation is not over until the new credential is confirmed in use.** The new
 * credential is sent once, over a socket that can drop as it is sent, so the one
 * before it stays valid until the client shows it has the new one (by saying so, or
 * by using it), and no longer than `credentialConfirmGraceMs`. Once confirmed, the old
 * one is refused for good.
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
    const { tokenHash: _tokenHash, previousTokenHash: _previousTokenHash, ...view } = client;
    const status = client.revokedAt ? "revoked" : client.expiresAt <= this.config.now() ? "expired" : "active";
    return { ...view, status };
  }

  get(trustedClientId: string): ClientGatewayTrustedClient | undefined {
    return this.clients.get(trustedClientId);
  }

  /** The trusted client a raw bearer token maps to, active or not: its current credential, or the one before it while that is still unconfirmed and within its bound. */
  resolveByToken(token: string): ClientGatewayTrustedClient | undefined {
    const tokenHash = this.hashToken(token);
    const trustedClientId = this.idByTokenHash.get(tokenHash);
    const client = trustedClientId ? this.clients.get(trustedClientId) : undefined;
    if (!client) return undefined;
    if (client.tokenHash === tokenHash) return client;
    if (client.previousTokenHash === tokenHash && (client.previousValidUntil ?? 0) > this.config.now()) return client;
    return undefined;
  }

  /** True when `token` is this client's current credential, not the one before it. */
  isCurrentToken(client: ClientGatewayTrustedClient, token: string): boolean {
    return client.tokenHash === this.hashToken(token);
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
    domainId: string | null;
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
      domainId: input.domainId,
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

  /**
   * Issue a replacement on reconnect, returning the new one-time token, and slide the
   * credential's life. `presented` is what the client connected with. Its current
   * credential stays valid, as the one before, until the new one is confirmed. The one
   * before, presented again (the last reply never arrived), stays the one before under
   * its first bound, and the reply it never received is dropped: repeating cannot
   * stretch the bound. `beforeCommit` runs with the new token before its digest
   * replaces the old one, for whatever must be written ahead of that
   * (`./credential-custody.ts`).
   */
  async rotateToken(trustedClient: ClientGatewayTrustedClient, presented: string, beforeCommit?: (token: string) => Promise<void>): Promise<string> {
    const token = this.config.createToken();
    await beforeCommit?.(token);
    const before = lifetimeFields(trustedClient);
    const now = this.config.now();
    const presentedHash = this.hashToken(presented);
    if (presentedHash === before.tokenHash) {
      if (before.previousTokenHash) this.idByTokenHash.delete(before.previousTokenHash);
      trustedClient.previousTokenHash = presentedHash;
      trustedClient.previousValidUntil = now + this.config.credentialConfirmGraceMs;
    } else {
      this.idByTokenHash.delete(before.tokenHash);
    }
    trustedClient.tokenHash = this.hashToken(token);
    trustedClient.updatedAt = now;
    trustedClient.lastUsedAt = now;
    trustedClient.expiresAt = now + this.config.trustedClientTtlMs;
    this.idByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
    try {
      await this.persist();
    } catch (error) {
      this.idByTokenHash.delete(trustedClient.tokenHash);
      this.restore(trustedClient, before);
      throw error;
    }
    return token;
  }

  /** The client showed it has its current credential: the one before it is refused from now on. False when there was none. */
  async confirmCurrent(trustedClient: ClientGatewayTrustedClient): Promise<boolean> {
    const previous = trustedClient.previousTokenHash;
    if (!previous) return false;
    const before = lifetimeFields(trustedClient);
    delete trustedClient.previousTokenHash;
    delete trustedClient.previousValidUntil;
    this.idByTokenHash.delete(previous);
    try {
      await this.persist();
    } catch (error) {
      this.restore(trustedClient, before);
      throw error;
    }
    return true;
  }

  /** The client used its current credential: its life slides, stored at most once a day. */
  async renew(trustedClient: ClientGatewayTrustedClient): Promise<void> {
    const now = this.config.now();
    const next = now + this.config.trustedClientTtlMs;
    if (next - trustedClient.expiresAt < Math.min(RENEW_EVERY_MS, this.config.trustedClientTtlMs / 2)) return;
    const before = lifetimeFields(trustedClient);
    trustedClient.expiresAt = next;
    trustedClient.lastUsedAt = now;
    try {
      await this.persist();
    } catch (error) {
      this.restore(trustedClient, before);
      throw error;
    }
  }

  async revoke(trustedClient: ClientGatewayTrustedClient, reason: string): Promise<void> {
    const now = this.config.now();
    const previousUpdatedAt = trustedClient.updatedAt;
    trustedClient.revokedAt = now;
    trustedClient.revocationReason = reason;
    trustedClient.updatedAt = now;
    this.idByTokenHash.delete(trustedClient.tokenHash);
    if (trustedClient.previousTokenHash) this.idByTokenHash.delete(trustedClient.previousTokenHash);
    try {
      await this.persist();
    } catch (error) {
      delete trustedClient.revokedAt;
      delete trustedClient.revocationReason;
      trustedClient.updatedAt = previousUpdatedAt;
      this.index(trustedClient);
      throw error;
    }
  }

  private restore(trustedClient: ClientGatewayTrustedClient, before: LifetimeFields): void {
    trustedClient.tokenHash = before.tokenHash;
    trustedClient.updatedAt = before.updatedAt;
    trustedClient.lastUsedAt = before.lastUsedAt;
    trustedClient.expiresAt = before.expiresAt;
    if (before.previousTokenHash === undefined) delete trustedClient.previousTokenHash;
    else trustedClient.previousTokenHash = before.previousTokenHash;
    if (before.previousValidUntil === undefined) delete trustedClient.previousValidUntil;
    else trustedClient.previousValidUntil = before.previousValidUntil;
    this.index(trustedClient);
  }

  private index(client: ClientGatewayTrustedClient): void {
    this.idByTokenHash.set(client.tokenHash, client.trustedClientId);
    if (client.previousTokenHash) this.idByTokenHash.set(client.previousTokenHash, client.trustedClientId);
  }

  private async load(): Promise<void> {
    if (!this.config.trustedClientStore) return;
    const clients = await this.config.trustedClientStore.load();
    for (const client of clients) {
      if (!client?.trustedClientId || !client.clientId || !client.tokenHash || !client.approvedByUserId) continue;
      const loaded = { ...client };
      this.clients.set(client.trustedClientId, loaded);
      if (this.isActive(client)) this.index(loaded);
    }
  }

  private async persist(): Promise<void> {
    if (!this.config.trustedClientStore) return;
    await this.config.trustedClientStore.save(this.list().map((client) => ({ ...client })));
  }
}

function lifetimeFields(client: ClientGatewayTrustedClient): LifetimeFields {
  return {
    tokenHash: client.tokenHash,
    ...(client.previousTokenHash === undefined ? {} : { previousTokenHash: client.previousTokenHash }),
    ...(client.previousValidUntil === undefined ? {} : { previousValidUntil: client.previousValidUntil }),
    updatedAt: client.updatedAt,
    lastUsedAt: client.lastUsedAt,
    expiresAt: client.expiresAt
  };
}
