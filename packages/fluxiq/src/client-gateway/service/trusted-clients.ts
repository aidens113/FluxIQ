import { randomBytes, randomUUID } from "node:crypto";
import { ClientGatewayTrustEndedError } from "./trust-ended-error.ts";
import type { ClientGatewayManagedHost, ClientGatewayTrustedClient, ClientGatewayTrustedClientView } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "./config.ts";
import { classifyClientGatewayCredential, clientGatewayCredentialHash, clientGatewayCredentialId, issueClientGatewayCredential } from "./credentials/index.ts";
import type { ClientGatewayApprovedTrustInput, ClientGatewayTrustApproval } from "./trust-issuance/index.ts";
import { ClientGatewayTrustIssuanceError, validateApprovedTrustInput, validateTrustApproval } from "./trust-issuance/index.ts";

/** How often a client in steady use has its credential's life extended and stored: its next message would do, so this only saves writes. */
const RENEW_EVERY_MS = 24 * 60 * 60_000;

/** The fields a rotation or a renewal changes, kept so a store that refuses the write can put them back. */
type LifetimeFields = Pick<ClientGatewayTrustedClient, "tokenHash" | "previousTokenHash" | "previousValidUntil" | "reuseKey" | "lastMovedOnAt" | "updatedAt" | "lastUsedAt" | "expiresAt">;

type RegisterInput = {
  clientId: string;
  clientType: ClientGatewayTrustedClient["clientType"];
  name: string;
  approvedByUserId: string;
  domainId: string | null;
  managedHost?: ClientGatewayManagedHost;
  clientInstallId?: string;
  approvingSessionDigest?: string;
};

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
 *
 * **Reuse is detected.** A credential names its client and is signed under a key that
 * client alone keeps, so Core can tell one it issued from noise with nothing remembered
 * per credential. One of this client's that is neither its current one nor the one before
 * can only be a copy, so that revokes the trust: the real browser pairs again, and whoever
 * holds a copy is out too. Renewal has no upper bound, and this is what covers it. A
 * credential still in the lost-reply window is not a reuse, and nor is a request already
 * on its way as its credential moved on.
 */
export class ClientGatewayTrustedClientRegistry {
  private readonly clients = new Map<string, ClientGatewayTrustedClient>();
  private readonly idByTokenHash = new Map<string, string>();
  private readonly config: ClientGatewayConfig;
  private readonly loaded: Promise<void>;
  private loadError: unknown;
  private mutationTail = Promise.resolve();

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

  /**
   * Resolves once this registry's initial load and already queued mutations have settled.
   * A close waits for it: that read holds the database file open, and whoever closed this
   * instance may remove the file next (t867).
   */
  async settled(): Promise<void> {
    await this.loaded;
    await this.mutationTail;
  }

  hashToken(token: string): string {
    return clientGatewayCredentialHash(token);
  }

  isActive(client: ClientGatewayTrustedClient): boolean {
    return client.revokedAt === undefined && client.expiresAt > this.config.now();
  }

  /** The trusted-client view callers outside the gateway see: no token hash. */
  toView(client: ClientGatewayTrustedClient): ClientGatewayTrustedClientView {
    const { tokenHash: _tokenHash, previousTokenHash: _previousTokenHash, reuseKey: _reuseKey, approvingSessionDigest: _approvingSessionDigest, ...view } = client;
    const status = client.revokedAt !== undefined ? "revoked" : client.expiresAt <= this.config.now() ? "expired" : "active";
    return { ...view, status };
  }

  get(trustedClientId: string): ClientGatewayTrustedClient | undefined {
    return this.clients.get(trustedClientId);
  }

  /** Detached committed proof; live records can expose a save's tentative values until rollback. */
  async readCommittedCredential(client: ClientGatewayTrustedClient): Promise<Readonly<Pick<ClientGatewayTrustedClient, "tokenHash" | "expiresAt">> | undefined> {
    return this.mutate(async () => {
      if (this.clients.get(client.trustedClientId) !== client || !this.isActive(client)) return undefined;
      return { tokenHash: client.tokenHash, expiresAt: client.expiresAt };
    });
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

  /**
   * The active client this credential was issued to, when presenting it is a reuse: one it
   * has moved on from, or the one before whose bound has passed. `request` says it came on a
   * request rather than a hello, which may just have been on its way. A credential that
   * merely names a client, unsigned, is noise, so nobody can end someone's trust by naming it.
   */
  reuseOf(token: string, options: { request?: boolean } = {}): ClientGatewayTrustedClient | undefined {
    const trustedClientId = clientGatewayCredentialId(token);
    const client = trustedClientId ? this.clients.get(trustedClientId) : undefined;
    if (!client || !this.isActive(client)) return undefined;
    const proof = classifyClientGatewayCredential(client, token, this.config.now(), options);
    return proof.status === "obsolete" && proof.reuse === "revoke" ? client : undefined;
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
   * Mint durable trust for a freshly paired or enrolled session. Returns the
   * one-time token with the client; `trustedClient.approvedAt` is the single
   * timestamp the caller should reuse for the pairing and the session.
   * `managedHost` is kept with the trust when an enrolment ticket granted it.
   */
  async register(input: RegisterInput): Promise<{ trustedClient: ClientGatewayTrustedClient; token: string }> {
    return this.mutate(() => this.registerCommitted(input));
  }

  /**
   * Authenticated ordinary trust: validate inside the same mutation queue as quota and replacement,
   * then persist every old revocation and the fresh grant together. Independent stale stores refuse
   * their generation CAS; they are not silently refreshed around other live gateway sessions.
   */
  async issueApproved(rawInput: ClientGatewayApprovedTrustInput, approval: () => Promise<ClientGatewayTrustApproval>): Promise<{ trustedClient: ClientGatewayTrustedClient; token: string; replaced: ClientGatewayTrustedClient[] }> {
    const input = validateApprovedTrustInput(rawInput);
    return this.mutate(async () => {
      const approved = validateTrustApproval(input, await approval());
      const now = this.config.now();
      const ttl = this.config.trustedClientTtlMs;
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(ttl) || ttl < 1 || !Number.isSafeInteger(now + ttl)) throw new ClientGatewayTrustIssuanceError("unavailable");
      const active = this.list().filter((client) => client.approvedByUserId === approved.userId && client.managedHost === undefined && this.isActive(client));
      const replaced = active.filter((client) => client.clientId === input.clientId && client.clientInstallId === input.clientInstallId);
      if (active.length - replaced.length >= approved.maxActiveClients) throw new ClientGatewayTrustIssuanceError("client_limit_reached");
      const { trustedClient, token } = this.createClient(input, now);
      const before = replaced.map((client) => ({ client, updatedAt: client.updatedAt, revokedAt: client.revokedAt, revocationReason: client.revocationReason }));
      for (const client of replaced) {
        client.revokedAt = now;
        client.revocationReason = "the same client installation was approved again";
        client.updatedAt = now;
        this.idByTokenHash.delete(client.tokenHash);
        if (client.previousTokenHash) this.idByTokenHash.delete(client.previousTokenHash);
      }
      this.clients.set(trustedClient.trustedClientId, trustedClient);
      this.idByTokenHash.set(trustedClient.tokenHash, trustedClient.trustedClientId);
      try {
        await this.persist();
      } catch (error) {
        this.clients.delete(trustedClient.trustedClientId);
        this.idByTokenHash.delete(trustedClient.tokenHash);
        for (const snapshot of before) {
          snapshot.client.updatedAt = snapshot.updatedAt;
          if (snapshot.revokedAt === undefined) delete snapshot.client.revokedAt;
          else snapshot.client.revokedAt = snapshot.revokedAt;
          if (snapshot.revocationReason === undefined) delete snapshot.client.revocationReason;
          else snapshot.client.revocationReason = snapshot.revocationReason;
          this.index(snapshot.client);
        }
        throw error;
      }
      return { trustedClient, token, replaced };
    });
  }

  private async registerCommitted(input: RegisterInput): Promise<{ trustedClient: ClientGatewayTrustedClient; token: string }> {
    const now = this.config.now();
    const { trustedClient, token } = this.createClient(input, now);
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

  private createClient(input: RegisterInput, now: number): { trustedClient: ClientGatewayTrustedClient; token: string } {
    const trustedClientId = randomUUID();
    const reuseKey = randomBytes(32).toString("base64url");
    const token = issueClientGatewayCredential(trustedClientId, reuseKey, this.config.createToken());
    const trustedClient: ClientGatewayTrustedClient = {
      trustedClientId,
      reuseKey,
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
    if (input.managedHost !== undefined) trustedClient.managedHost = { hostId: input.managedHost.hostId, profile: input.managedHost.profile };
    if (input.clientInstallId !== undefined) trustedClient.clientInstallId = input.clientInstallId;
    if (input.approvingSessionDigest !== undefined) trustedClient.approvingSessionDigest = input.approvingSessionDigest;
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
    for (;;) {
      // A client paired before credentials named it gets its key here.
      const reuseKey = trustedClient.reuseKey ?? randomBytes(32).toString("base64url");
      const token = issueClientGatewayCredential(trustedClient.trustedClientId, reuseKey, this.config.createToken());
      // Custody must not hold the mutation queue: revocation can end trust while it waits.
      await beforeCommit?.(token);
      const committed = await this.mutate(() => this.commitRotation(trustedClient, presented, reuseKey, token));
      if (committed) return token;
      // Another legacy reconnect committed its signing key first. Prepare custody for that durable key.
    }
  }

  private async commitRotation(trustedClient: ClientGatewayTrustedClient, presented: string, reuseKey: string, token: string): Promise<boolean> {
    // The write ahead took a moment, and the trust may have ended in it.
    if (!this.isActive(trustedClient)) throw new ClientGatewayTrustEndedError();
    if (trustedClient.reuseKey !== undefined && trustedClient.reuseKey !== reuseKey) return false;
    const before = lifetimeFields(trustedClient);
    const now = this.config.now();
    const presentedHash = this.hashToken(presented);
    if (presentedHash === before.tokenHash) {
      if (before.previousTokenHash) this.idByTokenHash.delete(before.previousTokenHash);
      trustedClient.previousTokenHash = presentedHash;
      trustedClient.previousValidUntil = now + this.config.credentialConfirmGraceMs;
    } else {
      // The one before came back, so the reply sent to it did not arrive here. If it is ever presented, someone else had it.
      this.idByTokenHash.delete(before.tokenHash);
    }
    trustedClient.reuseKey = reuseKey;
    trustedClient.lastMovedOnAt = now;
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
    return true;
  }

  /** The client showed it has its current credential: the one before it is refused from now on. False when there was none. */
  async confirmCurrent(trustedClient: ClientGatewayTrustedClient): Promise<boolean> {
    const expectedHash = trustedClient.tokenHash;
    return this.mutate(async () => {
      if (!this.isActive(trustedClient) || trustedClient.tokenHash !== expectedHash) return false;
      const previous = trustedClient.previousTokenHash;
      if (!previous) return false;
      const before = lifetimeFields(trustedClient);
      delete trustedClient.previousTokenHash;
      delete trustedClient.previousValidUntil;
      trustedClient.lastMovedOnAt = this.config.now();
      this.idByTokenHash.delete(previous);
      try {
        await this.persist();
      } catch (error) {
        this.restore(trustedClient, before);
        throw error;
      }
      return true;
    });
  }

  /** The client used its current credential: its life slides, stored at most once a day. */
  async renew(trustedClient: ClientGatewayTrustedClient): Promise<void> {
    return this.mutate(async () => {
      if (!this.isActive(trustedClient)) return;
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
    });
  }

  async revoke(trustedClient: ClientGatewayTrustedClient, reason: string): Promise<void> {
    return this.mutate(async () => {
      const now = this.config.now();
      const previousUpdatedAt = trustedClient.updatedAt;
      const previousRevokedAt = trustedClient.revokedAt;
      const previousReason = trustedClient.revocationReason;
      trustedClient.revokedAt = now;
      trustedClient.revocationReason = reason;
      trustedClient.updatedAt = now;
      this.idByTokenHash.delete(trustedClient.tokenHash);
      if (trustedClient.previousTokenHash) this.idByTokenHash.delete(trustedClient.previousTokenHash);
      try {
        await this.persist();
      } catch (error) {
        if (previousRevokedAt === undefined) delete trustedClient.revokedAt;
        else trustedClient.revokedAt = previousRevokedAt;
        if (previousReason === undefined) delete trustedClient.revocationReason;
        else trustedClient.revocationReason = previousReason;
        trustedClient.updatedAt = previousUpdatedAt;
        if (this.isActive(trustedClient)) this.index(trustedClient);
        throw error;
      }
    });
  }

  /** A failed persistence rollback cannot overwrite another mutation's committed memory. */
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(async () => {
      await this.ready();
      return operation();
    });
    // The returned promise retains failure; the tail only makes subsequent mutations wait for settlement.
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
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
    if (before.lastMovedOnAt === undefined) delete trustedClient.lastMovedOnAt;
    else trustedClient.lastMovedOnAt = before.lastMovedOnAt;
    if (before.reuseKey === undefined) delete trustedClient.reuseKey;
    else trustedClient.reuseKey = before.reuseKey;
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
  const fields: LifetimeFields = {
    tokenHash: client.tokenHash,
    updatedAt: client.updatedAt,
    lastUsedAt: client.lastUsedAt,
    expiresAt: client.expiresAt
  };
  if (client.previousTokenHash !== undefined) fields.previousTokenHash = client.previousTokenHash;
  if (client.previousValidUntil !== undefined) fields.previousValidUntil = client.previousValidUntil;
  if (client.lastMovedOnAt !== undefined) fields.lastMovedOnAt = client.lastMovedOnAt;
  if (client.reuseKey !== undefined) fields.reuseKey = client.reuseKey;
  return fields;
}
