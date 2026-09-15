import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type { JsonObject } from "../../../core/index.ts";
import { hashPassword, verifyPasswordHash } from "../../_shared/password-kdf/index.ts";
import type { Repository } from "../../database-manager/index.ts";
import {
  createCredentialKdf,
  createCredentialKey,
  isSameSealedCredential,
  needsCredentialReseal,
  openSealedCredential,
  runDummyCredentialDerivation,
  sealCredential,
  type CredentialKdf,
  type CredentialKey,
  type SealedCredentialRecord
} from "./credential-seal.ts";
import { defaultRoles } from "./roles.ts";
import { runCredentialChange } from "./run-credential-change.ts";
import { digestSessionId } from "./session-digest.ts";
import {
  credentialMetadata,
  identityRecord,
  readStoredState,
  type CredentialMetadata,
  type IdentityAccessState,
  type StoredSession
} from "./stored-state.ts";
import { createTotpSecret, verifyTotp } from "./totp.ts";
import type {
  IdentityAccessServiceOptions,
  IdentityAccessSnapshot,
  IdentityCredentialChange,
  IdentityCredentialChangeSubscriber,
  Role,
  Session,
  User,
  UserCredential,
  VaultStatus
} from "../types.ts";

const INVALID_CREDENTIALS = "Invalid username or credentials";

export class TotpRequiredError extends Error {
  constructor(message = "Authenticator code required") {
    super(message);
    this.name = "TotpRequiredError";
  }
}

export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class IdentityAccessService {
  private readonly users = new Map<string, User>();
  private readonly roles = new Map<string, Role>();
  private readonly credentials = new Map<string, UserCredential>();
  private readonly credentialMetadata = new Map<string, CredentialMetadata>();
  private readonly credentialKeys = new Map<string, CredentialKey>();
  private readonly encryptedCredentials = new Map<string, SealedCredentialRecord>();
  private readonly sessions = new Map<string, StoredSession>();
  /** Cold unlocks in flight, per user, so concurrent logins re-seal a record once. */
  private readonly coldUnlocks = new Map<string, Promise<UserCredential>>();
  private vault: VaultStatus = { initialized: false, unlocked: false };
  private readonly repository: Repository | undefined;
  private readonly kdf: CredentialKdf;
  private readonly credentialChangeSubscribers: readonly IdentityCredentialChangeSubscriber[];
  private loading: Promise<void> | undefined;

  constructor(options: IdentityAccessServiceOptions = {}) {
    const roles = options.roles ?? defaultRoles;
    for (const role of roles) {
      this.roles.set(role.id, role);
    }
    this.repository = options.repository;
    this.kdf = createCredentialKdf(options.passwordKdf);
    this.credentialChangeSubscribers = [...(options.credentialChangeSubscribers ?? [])];
  }

  async upsertRole(role: Role): Promise<Role> {
    await this.load();
    this.roles.set(role.id, role);
    await this.persist();
    return role;
  }

  async upsertUser(params: {
    id?: string;
    username: string;
    displayName: string;
    roleId: string;
    enabled?: boolean;
    totpEnabled?: boolean;
    nowMs?: number;
    password?: string;
    pin?: string;
  }): Promise<User> {
    await this.load();
    if (!this.roles.has(params.roleId)) {
      throw new Error(`Unknown role: ${params.roleId}`);
    }
    const now = params.nowMs ?? Date.now();
    const id = params.id ?? randomUUID();
    const existing = this.users.get(id);
    // Credentials of an existing account change only through setPassword, setPasswordAuthorized, setPin, and
    // setPinAuthorized, so the credential-change port and its subscribers are never bypassed.
    if (existing && (params.password || params.pin)) {
      throw new Error("An existing account's password or PIN cannot be changed here; use a password or PIN change");
    }
    const user: User = {
      id,
      username: params.username,
      displayName: params.displayName,
      roleId: params.roleId,
      enabled: params.enabled ?? existing?.enabled ?? true,
      totpEnabled: params.totpEnabled ?? existing?.totpEnabled ?? false,
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs: now
    };
    this.users.set(user.id, user);
    if (params.password) await this.setCredentialHash(user.id, "passwordHash", params.password);
    if (params.pin) await this.setCredentialHash(user.id, "pinHash", params.pin);
    await this.persist();
    return user;
  }

  async updateUser(params: {
    id: string;
    username?: string;
    displayName?: string;
    roleId?: string;
    enabled?: boolean;
    nowMs?: number;
  }): Promise<User> {
    await this.load();
    const existing = this.users.get(params.id);
    if (!existing) throw new Error(`Unknown user: ${params.id}`);
    if (params.roleId && !this.roles.has(params.roleId)) throw new Error(`Unknown role: ${params.roleId}`);
    const removesFinalAdmin = existing.enabled && existing.roleId === "admin"
      && (params.enabled === false || (params.roleId !== undefined && params.roleId !== "admin"))
      && ![...this.users.values()].some((user) => user.id !== existing.id && user.enabled && user.roleId === "admin");
    if (removesFinalAdmin) throw new Error("At least one enabled administrator is required");
    const next: User = {
      ...existing,
      username: params.username ?? existing.username,
      displayName: params.displayName ?? existing.displayName,
      roleId: params.roleId ?? existing.roleId,
      enabled: params.enabled ?? existing.enabled,
      updatedAtMs: params.nowMs ?? Date.now()
    };
    this.users.set(next.id, next);
    await this.persist();
    return next;
  }

  async setPassword(userId: string, password: string): Promise<UserCredential> {
    await this.load();
    return this.changePassword({ changeId: randomUUID(), userId, actorUserId: undefined, currentPassword: undefined, newPassword: password }, false);
  }

  async setPasswordAuthorized(params: {
    userId: string;
    password: string;
    sessionId: string | undefined;
    authorizationPassword: string | undefined;
    authorizationPin: string | undefined;
    authorizationTotp: string | undefined;
  }): Promise<UserCredential> {
    const actor = await this.authorizeCredentialRotation({
      targetUserId: params.userId,
      sessionId: params.sessionId,
      password: params.authorizationPassword,
      pin: params.authorizationPin,
      totp: params.authorizationTotp
    });
    const selfService = actor.id === params.userId;
    let resetSealedCredential = false;
    try {
      this.requireCredential(params.userId);
    } catch (error) {
      if (selfService || !(error instanceof Error) || error.message !== "Credential recheck required") throw error;
      resetSealedCredential = true;
    }
    return this.changePassword({
      changeId: randomUUID(),
      userId: params.userId,
      actorUserId: actor.id,
      currentPassword: selfService ? params.authorizationPassword : undefined,
      newPassword: params.password
    }, resetSealedCredential);
  }

  async setPin(userId: string, pin: string): Promise<UserCredential> {
    await this.load();
    const credential = await this.setCredentialHash(userId, "pinHash", pin);
    await this.persist();
    return credential;
  }

  async setPinAuthorized(params: {
    userId: string;
    pin: string;
    sessionId: string | undefined;
    authorizationPassword: string | undefined;
    authorizationPin: string | undefined;
    authorizationTotp: string | undefined;
  }): Promise<UserCredential> {
    await this.authorizeCredentialRotation({
      targetUserId: params.userId,
      sessionId: params.sessionId,
      password: params.authorizationPassword,
      pin: params.authorizationPin,
      totp: params.authorizationTotp
    });
    return this.setPin(params.userId, params.pin);
  }

  async beginTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string }> {
    await this.load();
    const user = this.requireUser(userId);
    const secret = createTotpSecret();
    const credential = this.requireCredential(user.id);
    credential.pendingTotpSecret = secret;
    credential.updatedAtMs = Date.now();
    this.credentials.set(user.id, credential);
    await this.persist();
    const issuer = "FluxIQ";
    const accountLabel = user.username;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6`;
    return {
      secret,
      otpauthUrl,
      qrSvg: await QRCode.toString(otpauthUrl, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220
      }),
      issuer,
      accountLabel
    };
  }

  async confirmTotp(userId: string, code: string): Promise<User> {
    await this.load();
    const credential = this.requireCredential(userId);
    if (!credential.pendingTotpSecret) throw new Error("No pending TOTP setup");
    if (!verifyTotp(credential.pendingTotpSecret, code)) throw new Error("Invalid TOTP code");
    credential.totpSecret = credential.pendingTotpSecret;
    delete credential.pendingTotpSecret;
    credential.updatedAtMs = Date.now();
    this.credentials.set(userId, credential);
    const user = this.requireUser(userId);
    const next = { ...user, totpEnabled: true, updatedAtMs: Date.now() };
    this.users.set(userId, next);
    await this.persist();
    return next;
  }

  async disableTotp(userId: string): Promise<User> {
    await this.load();
    const credential = this.requireCredential(userId);
    delete credential.totpSecret;
    delete credential.pendingTotpSecret;
    credential.updatedAtMs = Date.now();
    this.credentials.set(userId, credential);
    const user = this.requireUser(userId);
    const next = { ...user, totpEnabled: false, updatedAtMs: Date.now() };
    this.users.set(userId, next);
    await this.persist();
    return next;
  }

  async authenticate(params: { username: string; password: string; totp?: string; ttlMs?: number; nowMs?: number }): Promise<{ session: Session; user: User; role: Role }> {
    await this.load();
    const username = params.username.trim().toLowerCase();
    const user = [...this.users.values()].find((item) => item.username.toLowerCase() === username);
    if (!user || !user.enabled) {
      await runDummyCredentialDerivation(params.password, this.kdf);
      throw new Error(INVALID_CREDENTIALS);
    }
    const credential = await this.unlockCredential(user.id, params.password);
    if (credential.totpSecret && !verifyTotp(credential.totpSecret, params.totp ?? "")) {
      throw new TotpRequiredError(params.totp ? "Authenticator code failed" : "Authenticator code required");
    }
    const session = await this.createSession(user.id, params.ttlMs, params.nowMs);
    const role = this.roles.get(user.roleId);
    if (!role) throw new Error(`Unknown role: ${user.roleId}`);
    return { session, user: this.userWithCredentialStatus(user), role };
  }

  async createSession(userId: string, ttlMs = DEFAULT_SESSION_TTL_MS, nowMs = Date.now()): Promise<Session> {
    await this.load();
    const user = this.users.get(userId);
    if (!user || !user.enabled) {
      throw new Error(`Unknown or disabled user: ${userId}`);
    }
    const session: Session = {
      id: randomUUID(),
      userId,
      expiresAtMs: nowMs + ttlMs
    };
    const digest = digestSessionId(session.id);
    this.sessions.set(digest, { digest, userId, expiresAtMs: session.expiresAtMs });
    await this.persist();
    return session;
  }

  async validateSession(sessionId: string | undefined, nowMs = Date.now()): Promise<{ session: Session; user: User; role: Role } | null> {
    await this.load();
    if (!sessionId) return null;
    const digest = digestSessionId(sessionId);
    let stored = this.sessions.get(digest);
    if (!stored && this.repository) {
      await this.reloadFromStore();
      stored = this.sessions.get(digest);
    }
    if (!stored || stored.expiresAtMs <= nowMs) return null;
    const user = this.users.get(stored.userId);
    if (!user || !user.enabled) return null;
    const role = this.roles.get(user.roleId);
    if (!role) return null;
    return { session: { id: sessionId, userId: stored.userId, expiresAtMs: stored.expiresAtMs }, user: this.userWithCredentialStatus(user), role };
  }

  async authorizeSessionCredentials(params: { sessionId: string | undefined; password: string | undefined; pin: string | undefined; totp: string | undefined }): Promise<User> {
    const context = await this.validateSession(params.sessionId);
    if (!context) throw new Error("Authentication required");
    await this.verifyCredentialGate(context.user.id, {
      password: params.password ?? "",
      pin: params.pin ?? "",
      totp: params.totp
    });
    return context.user;
  }

  async authorizeSessionPasswordPin(params: { sessionId: string | undefined; password: string | undefined; pin: string | undefined }): Promise<User> {
    const context = await this.validateSession(params.sessionId);
    if (!context) throw new Error("Authentication required");
    await this.verifyCredentialGate(context.user.id, {
      password: params.password ?? "",
      pin: params.pin ?? "",
      requireTotp: false
    });
    return context.user;
  }

  async authorizeSessionPin(params: { sessionId: string | undefined; pin: string | undefined }): Promise<User> {
    const context = await this.validateSession(params.sessionId);
    if (!context) throw new Error("Authentication required");
    // A PIN verifies only against the credential unlocked in this process; no verifier is stored outside the seal.
    const credential = this.credentials.get(context.user.id);
    if (!credential?.pinHash && this.credentialMetadata.get(context.user.id)?.pinConfigured) {
      throw new Error("PIN verifier upgrade required. Sign out and sign back in, then try again.");
    }
    if (!credential?.pinHash) throw new Error("PIN is required for this action");
    if (!(await this.verifyPin(context.user.id, credential, params.pin ?? ""))) throw new Error("Invalid PIN");
    return context.user;
  }

  async authorizeCredentialRotation(params: { targetUserId: string; sessionId: string | undefined; password: string | undefined; pin: string | undefined; totp: string | undefined }): Promise<User> {
    const actor = await this.authorizeSessionCredentials({
      sessionId: params.sessionId,
      password: params.password,
      pin: params.pin,
      totp: params.totp
    });
    if (actor.id !== params.targetUserId && actor.roleId !== "admin") {
      throw new Error("Only admins can rotate another user's credentials");
    }
    return actor;
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    await this.load();
    const digest = digestSessionId(sessionId);
    const held = this.sessions.delete(digest);
    // Deleted from the store as well; otherwise the next reload would bring the session back.
    const stored = (await this.repository?.delete(`session:${digest}`, {})) ?? false;
    await this.persist();
    return held || stored;
  }

  async unlockVault(params: { userId: string; password?: string; pin?: string; totp?: string; nowMs?: number }): Promise<VaultStatus> {
    await this.load();
    this.requireUser(params.userId);
    const credential = this.requireCredential(params.userId);
    const passwordOk = params.password ? (await verifyPasswordHash(params.password, credential.passwordHash, this.kdf)).ok : true;
    const pinOk = params.pin ? (await verifyPasswordHash(params.pin, credential.pinHash, this.kdf)).ok : true;
    const totpOk = credential.totpSecret ? verifyTotp(credential.totpSecret, params.totp ?? "") : true;
    if (!passwordOk || !pinOk || !totpOk) throw new Error("Invalid vault credentials");
    this.vault = {
      initialized: true,
      unlocked: true,
      unlockedBy: params.userId,
      unlockedAtMs: params.nowMs ?? Date.now(),
      encryptedFieldCount: this.vault.encryptedFieldCount ?? 0
    };
    await this.persist();
    return this.vault;
  }

  async lockVault(): Promise<VaultStatus> {
    await this.load();
    this.vault = { initialized: this.vault.initialized, unlocked: false, encryptedFieldCount: this.vault.encryptedFieldCount ?? 0 };
    await this.persist();
    return this.vault;
  }

  async setVaultStatus(status: VaultStatus): Promise<VaultStatus> {
    await this.load();
    this.vault = status;
    await this.persist();
    return this.vault;
  }

  async snapshot(nowMs = Date.now()): Promise<IdentityAccessSnapshot> {
    await this.load();
    // Sessions are listed by digest; a snapshot never carries a bearer value.
    const sessions: Session[] = [...this.sessions.values()]
      .filter((session) => session.expiresAtMs > nowMs)
      .map((session) => ({ id: session.digest, userId: session.userId, expiresAtMs: session.expiresAtMs }));
    return {
      users: [...this.users.values()].map((user) => this.userWithCredentialStatus(user)).sort((left, right) => left.username.localeCompare(right.username)),
      roles: [...this.roles.values()].sort((left, right) => left.id.localeCompare(right.id)),
      sessions,
      vault: this.vault
    };
  }

  /** Single-flight: concurrent callers share one load, so none sees the maps before they are filled. */
  private load(): Promise<void> {
    this.loading ??= this.loadOnce().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  /** The first load, which also clears stored bearer values and PIN verifiers before any other operation runs. */
  private async loadOnce(): Promise<void> {
    if (this.repository) {
      const state = await readStoredState(this.repository);
      this.applyState(state);
      for (const id of state.rawSessionRecordIds) await this.repository.delete(id, {});
      for (const record of state.pinVerifierRecords) await this.repository.put(record);
    }
    if (await this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  private async reloadFromStore(): Promise<void> {
    if (!this.repository) return;
    this.applyState(await readStoredState(this.repository));
    if (await this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  /**
   * Replaces held state with stored state. A credential unlocked here keeps its
   * key across a reload while the stored seal is still the one this instance
   * holds; every other held key is zeroed.
   */
  private applyState(state: IdentityAccessState): void {
    const heldSeals = new Map(this.encryptedCredentials);
    const heldCredentials = new Map(this.credentials);
    const heldKeys = new Map(this.credentialKeys);
    this.users.clear();
    this.roles.clear();
    this.credentials.clear();
    this.credentialMetadata.clear();
    this.credentialKeys.clear();
    this.encryptedCredentials.clear();
    this.sessions.clear();
    for (const role of state.roles.length ? state.roles : defaultRoles) this.roles.set(role.id, role);
    for (const user of state.users) this.users.set(user.id, user);
    for (const credential of state.credentials) this.credentials.set(credential.userId, credential);
    for (const metadata of state.credentialMetadata) this.credentialMetadata.set(metadata.userId, metadata);
    for (const { userId, encrypted } of state.encryptedCredentials) {
      this.encryptedCredentials.set(userId, encrypted);
      const credential = heldCredentials.get(userId);
      const key = heldKeys.get(userId);
      if (!credential || !key || !isSameSealedCredential(heldSeals.get(userId), encrypted)) continue;
      this.credentials.set(userId, credential);
      this.credentialMetadata.set(userId, credentialMetadata(credential));
      this.credentialKeys.set(userId, key);
      heldKeys.delete(userId);
    }
    for (const key of heldKeys.values()) key.key.fill(0);
    for (const session of state.sessions) this.sessions.set(session.digest, session);
    this.vault = state.vault ?? { initialized: false, unlocked: false };
  }

  private async persist(): Promise<void> {
    if (!this.repository) return;
    const now = Date.now();
    for (const user of this.users.values()) {
      await this.repository.put(identityRecord(`user:${user.id}`, "user", { recordType: "user", user: user as unknown as JsonObject }, now));
    }
    for (const role of this.roles.values()) {
      await this.repository.put(identityRecord(`role:${role.id}`, "role", { recordType: "role", role: role as unknown as JsonObject }, now));
    }
    for (const credential of this.credentials.values()) {
      const key = this.credentialKeys.get(credential.userId);
      const sealed = key ? sealCredential(credential, key) : this.encryptedCredentials.get(credential.userId);
      if (!sealed) continue;
      const metadata = credentialMetadata(credential);
      // Held before the write, so a reload that reads this record back still matches the held key.
      this.credentialMetadata.set(credential.userId, metadata);
      this.encryptedCredentials.set(credential.userId, sealed);
      await this.repository.put(identityRecord(`credential:${credential.userId}`, "credential", {
        recordType: "credential",
        encrypted: true,
        metadata: metadata as unknown as JsonObject,
        sealed: sealed as unknown as JsonObject
      }, now));
    }
    for (const session of this.sessions.values()) {
      await this.repository.put(identityRecord(`session:${session.digest}`, "session", {
        recordType: "session",
        sessionDigest: { digest: session.digest, userId: session.userId, expiresAtMs: session.expiresAtMs }
      }, now));
    }
    await this.repository.put(identityRecord("vault", "vault", { recordType: "vault", vault: this.vault as unknown as JsonObject }, now));
  }

  private requireUser(userId: string): User {
    const user = this.users.get(userId);
    if (!user || !user.enabled) throw new Error(`Unknown or disabled user: ${userId}`);
    return user;
  }

  private userWithCredentialStatus(user: User): User {
    const credential = this.credentials.get(user.id);
    const metadata = this.credentialMetadata.get(user.id);
    return {
      ...user,
      passwordConfigured: Boolean(credential?.passwordHash) || Boolean(metadata?.passwordConfigured),
      pinConfigured: Boolean(credential?.pinHash) || Boolean(metadata?.pinConfigured)
    };
  }

  private requireCredential(userId: string): UserCredential {
    this.requireUser(userId);
    const credential = this.credentials.get(userId);
    if (credential) return credential;
    if (this.encryptedCredentials.has(userId)) throw new Error("Credential recheck required");
    return { userId, updatedAtMs: Date.now() };
  }

  /**
   * Hashes a password or PIN and, for a password, derives a new-salt key. An
   * administrator resetting another account whose sealed credential is not
   * unlocked here starts from an empty credential with two-factor
   * authentication disabled.
   */
  private async setCredentialHash(userId: string, field: "passwordHash" | "pinHash", value: string, resetSealedCredential = false): Promise<UserCredential> {
    if (resetSealedCredential) this.requireUser(userId);
    else this.requireCredential(userId);
    const hash = await hashPassword(value, this.kdf);
    const key = field === "passwordHash" ? await createCredentialKey(value, this.kdf) : undefined;
    if (resetSealedCredential && !this.credentials.has(userId)) {
      this.credentials.set(userId, { userId, updatedAtMs: Date.now() });
      const user = this.users.get(userId);
      if (user?.totpEnabled) this.users.set(user.id, { ...user, totpEnabled: false, updatedAtMs: Date.now() });
    }
    let credential: UserCredential;
    try {
      credential = this.requireCredential(userId);
    } catch (error) {
      key?.key.fill(0);
      throw error;
    }
    credential[field] = hash;
    credential.updatedAtMs = Date.now();
    this.credentials.set(userId, credential);
    if (key) holdCredentialKey(this.credentialKeys, userId, key);
    this.credentialMetadata.set(userId, credentialMetadata(credential));
    return credential;
  }

  /**
   * Writes a new password through the credential-change port: subscribers
   * prepare, the credential is written, then they commit. A failed write is
   * undone in memory as well, so this instance, the store, and every aborted
   * subscriber still agree on the old password.
   */
  private changePassword(change: IdentityCredentialChange, resetSealedCredential: boolean): Promise<UserCredential> {
    const { userId } = change;
    return runCredentialChange(this.credentialChangeSubscribers, change, async () => {
      const heldCredential = this.credentials.get(userId);
      const heldKey = this.credentialKeys.get(userId);
      const previous = {
        credential: heldCredential ? { ...heldCredential } : undefined,
        key: heldKey ? { salt: heldKey.salt, kdfParams: heldKey.kdfParams, key: Buffer.from(heldKey.key) } : undefined,
        metadata: this.credentialMetadata.get(userId),
        sealed: this.encryptedCredentials.get(userId),
        user: this.users.get(userId)
      };
      const credential = await this.setCredentialHash(userId, "passwordHash", change.newPassword, resetSealedCredential);
      try {
        await this.persist();
      } catch (error) {
        restoreEntry(this.credentials, userId, previous.credential);
        restoreEntry(this.credentialMetadata, userId, previous.metadata);
        restoreEntry(this.encryptedCredentials, userId, previous.sealed);
        restoreEntry(this.users, userId, previous.user);
        this.credentialKeys.get(userId)?.key.fill(0);
        restoreEntry(this.credentialKeys, userId, previous.key);
        throw error;
      }
      previous.key?.key.fill(0);
      return credential;
    });
  }

  private async verifyCredentialGate(userId: string, params: { password: string; pin: string; totp?: string | undefined; requireTotp?: boolean }): Promise<void> {
    const credential = await this.unlockCredential(userId, params.password);
    const pinOk = credential.pinHash ? await this.verifyPin(userId, credential, params.pin) : true;
    const requireTotp = params.requireTotp ?? true;
    const totpOk = requireTotp && credential.totpSecret ? verifyTotp(credential.totpSecret, params.totp ?? "") : true;
    if (!pinOk || !totpOk) throw new Error(INVALID_CREDENTIALS);
  }

  /**
   * Verifies a PIN against a held credential. A correct legacy or below-cost
   * PIN hash is rehashed and re-sealed, but only while this credential and its
   * key are held, so the rehash is never lost or written outside the seal.
   */
  private async verifyPin(userId: string, credential: UserCredential, pin: string): Promise<boolean> {
    const verification = await verifyPasswordHash(pin, credential.pinHash, this.kdf);
    if (!verification.ok) return false;
    if (verification.needsRehash && this.credentials.get(userId) === credential && this.credentialKeys.has(userId)) {
      credential.pinHash = await hashPassword(pin, this.kdf);
      this.credentialMetadata.set(userId, credentialMetadata(credential));
      await this.persist();
    }
    return true;
  }

  /**
   * Returns the user's credential, proven by one password derivation, or
   * throws. A held credential verifies against its password hash; a sealed one
   * opens with the password, where the GCM check is the proof. A caller that
   * finds a cold unlock in flight for the same user waits for it, then verifies
   * against the credential it left held, so concurrent logins re-seal once.
   */
  private async unlockCredential(userId: string, password: string): Promise<UserCredential> {
    for (let pending = this.coldUnlocks.get(userId); pending; pending = this.coldUnlocks.get(userId)) {
      await pending.catch(() => undefined);
    }
    const held = this.credentials.get(userId);
    const sealed = this.encryptedCredentials.get(userId);
    if (!held && sealed) {
      const unlock = this.openCredential(userId, sealed, password);
      this.coldUnlocks.set(userId, unlock);
      try {
        return await unlock;
      } finally {
        if (this.coldUnlocks.get(userId) === unlock) this.coldUnlocks.delete(userId);
      }
    }
    if (!held?.passwordHash) {
      await runDummyCredentialDerivation(password, this.kdf);
      throw new Error(INVALID_CREDENTIALS);
    }
    const verification = await verifyPasswordHash(password, held.passwordHash, this.kdf);
    if (!verification.ok) throw new Error(INVALID_CREDENTIALS);
    if (verification.needsRehash || !this.credentialKeys.has(userId)) {
      if (verification.needsRehash) held.passwordHash = await hashPassword(password, this.kdf);
      if (!this.credentialKeys.has(userId)) holdCredentialKey(this.credentialKeys, userId, await createCredentialKey(password, this.kdf));
      this.credentialMetadata.set(userId, credentialMetadata(held));
      await this.persist();
    }
    return held;
  }

  /**
   * The cold path. Opens the seal; a version 1 or below-cost record is then
   * re-sealed under a new-salt key with its password hash rehashed. A failed
   * open changes nothing.
   */
  private async openCredential(userId: string, sealed: SealedCredentialRecord, password: string): Promise<UserCredential> {
    const opened = await openSealedCredential(sealed, password, this.kdf).catch(() => null);
    if (!opened || opened.credential.userId !== userId) {
      opened?.key?.key.fill(0);
      throw new Error(INVALID_CREDENTIALS);
    }
    const { credential } = opened;
    let key = opened.key;
    const reseal = needsCredentialReseal(sealed, this.kdf);
    if (reseal) {
      key?.key.fill(0);
      credential.passwordHash = await hashPassword(password, this.kdf);
      key = await createCredentialKey(password, this.kdf);
    }
    // Unreachable while every version 1 record re-seals; a version 1 key is never held.
    if (!key) throw new Error(INVALID_CREDENTIALS);
    this.credentials.set(userId, credential);
    this.credentialMetadata.set(userId, credentialMetadata(credential));
    holdCredentialKey(this.credentialKeys, userId, key);
    if (reseal) await this.persist();
    return credential;
  }

  private async ensureDefaultAdmin(): Promise<boolean> {
    if (this.users.size > 0) return false;
    const now = Date.now();
    const user: User = {
      id: "admin",
      username: "admin",
      displayName: "Administrator",
      roleId: "admin",
      enabled: true,
      totpEnabled: false,
      createdAtMs: now,
      updatedAtMs: now
    };
    this.users.set(user.id, user);
    await this.setCredentialHash(user.id, "passwordHash", "admin");
    return true;
  }
}

/** Holds a credential key for a user, zeroing the key it replaces. */
function holdCredentialKey(keys: Map<string, CredentialKey>, userId: string, key: CredentialKey): void {
  const previous = keys.get(userId);
  if (previous && previous.key !== key.key) previous.key.fill(0);
  keys.set(userId, key);
}

function restoreEntry<T>(entries: Map<string, T>, id: string, value: T | undefined): void {
  if (value === undefined) entries.delete(id);
  else entries.set(id, value);
}
