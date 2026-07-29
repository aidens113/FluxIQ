import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { JsonObject } from "../../../core";
import type { RecordEnvelope, Repository } from "../../database-manager";
import { defaultRoles } from "./roles";
import type { IdentityAccessSnapshot, Role, Session, User, UserCredential, VaultRecord, VaultStatus } from "../types";

type IdentityAccessState = {
  users: User[];
  roles: Role[];
  credentials: UserCredential[];
  credentialMetadata: CredentialMetadata[];
  encryptedCredentials: Array<{ userId: string; encrypted: EncryptedCredentialRecord }>;
  sessions: Session[];
  vault: VaultStatus;
  vaultRecords: VaultRecord[];
};

type CredentialMetadata = {
  userId: string;
  passwordConfigured: boolean;
  pinConfigured: boolean;
  pinVerifierHash?: string;
  totpConfigured: boolean;
  pendingTotpConfigured: boolean;
  updatedAtMs: number;
};

type CredentialKey = {
  salt: string;
  key: Buffer;
};

type EncryptedCredentialRecord = {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

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
  private readonly encryptedCredentials = new Map<string, EncryptedCredentialRecord>();
  private readonly sessions = new Map<string, Session>();
  private vault: VaultStatus = { initialized: false, unlocked: false };
  private readonly repository: Repository | undefined;
  private loaded = false;

  constructor(options: { repository?: Repository; roles?: Role[] } = {}) {
    const roles = options.roles ?? defaultRoles;
    for (const role of roles) {
      this.roles.set(role.id, role);
    }
    this.repository = options.repository;
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
    if (params.password) this.setCredentialHash(user.id, "passwordHash", params.password);
    if (params.pin) this.setCredentialHash(user.id, "pinHash", params.pin);
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
    const credential = this.setCredentialHash(userId, "passwordHash", password);
    await this.persist();
    return credential;
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
    try {
      this.requireCredential(params.userId);
    } catch (error) {
      if (actor.id !== params.userId && error instanceof Error && error.message === "Credential recheck required") {
        this.credentials.set(params.userId, { userId: params.userId, updatedAtMs: Date.now() });
        const user = this.users.get(params.userId);
        if (user?.totpEnabled) this.users.set(user.id, { ...user, totpEnabled: false, updatedAtMs: Date.now() });
      } else {
        throw error;
      }
    }
    return this.setPassword(params.userId, params.password);
  }

  async setPin(userId: string, pin: string): Promise<UserCredential> {
    await this.load();
    const credential = this.setCredentialHash(userId, "pinHash", pin);
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
    const secret = base32(randomBytes(20));
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
    const user = [...this.users.values()].find((item) => item.username.toLowerCase() === params.username.trim().toLowerCase());
    if (!user || !user.enabled) throw new Error("Invalid username or credentials");
    const credential = this.unlockCredentialWithPassword(user.id, params.password);
    const passwordOk = verifySecret(params.password, credential.passwordHash);
    if (!passwordOk) throw new Error("Invalid username or credentials");
    if (credential.totpSecret && !verifyTotp(credential.totpSecret, params.totp ?? "")) {
      throw new TotpRequiredError(params.totp ? "Authenticator code failed" : "Authenticator code required");
    }
    await this.ensurePinVerifierMetadata(credential);
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
    this.sessions.set(session.id, session);
    await this.persist();
    return session;
  }

  async validateSession(sessionId: string | undefined, nowMs = Date.now()): Promise<{ session: Session; user: User; role: Role } | null> {
    await this.load();
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session && this.repository) {
      await this.reloadFromStore();
      session = this.sessions.get(sessionId);
    }
    if (!session || session.expiresAtMs <= nowMs) return null;
    const user = this.users.get(session.userId);
    if (!user || !user.enabled) return null;
    const role = this.roles.get(user.roleId);
    if (!role) return null;
    return { session, user: this.userWithCredentialStatus(user), role };
  }

  async authorizeSessionCredentials(params: { sessionId: string | undefined; password: string | undefined; pin: string | undefined; totp: string | undefined }): Promise<User> {
    const context = await this.validateSession(params.sessionId);
    if (!context) throw new Error("Authentication required");
    this.verifyCredentialGate(context.user.id, {
      password: params.password ?? "",
      pin: params.pin ?? "",
      totp: params.totp
    });
    return context.user;
  }

  async authorizeSessionPin(params: { sessionId: string | undefined; pin: string | undefined }): Promise<User> {
    const context = await this.validateSession(params.sessionId);
    if (!context) throw new Error("Authentication required");
    const credential = this.credentials.get(context.user.id);
    const metadata = this.credentialMetadata.get(context.user.id);
    const pinHash = credential?.pinHash ?? metadata?.pinVerifierHash;
    if (!pinHash && metadata?.pinConfigured) throw new Error("PIN verifier upgrade required. Sign out and sign back in, then try again.");
    if (!pinHash) throw new Error("PIN is required for this action");
    if (!verifySecret(params.pin ?? "", pinHash)) throw new Error("Invalid PIN");
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
    const deleted = this.sessions.delete(sessionId);
    await this.persist();
    return deleted;
  }

  async unlockVault(params: { userId: string; password?: string; pin?: string; totp?: string; nowMs?: number }): Promise<VaultStatus> {
    await this.load();
    this.requireUser(params.userId);
    const credential = this.requireCredential(params.userId);
    const passwordOk = params.password ? verifySecret(params.password, credential.passwordHash) : true;
    const pinOk = params.pin ? verifySecret(params.pin, credential.pinHash) : true;
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
    const sessions = [...this.sessions.values()].filter((session) => session.expiresAtMs > nowMs);
    return {
      users: [...this.users.values()].map((user) => this.userWithCredentialStatus(user)).sort((left, right) => left.username.localeCompare(right.username)),
      roles: [...this.roles.values()].sort((left, right) => left.id.localeCompare(right.id)),
      sessions,
      vault: this.vault
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.repository) {
      this.ensureDefaultAdmin();
      return;
    }
    const state = await this.readStoredState();
    this.applyState(state);
    if (this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  private async reloadFromStore(): Promise<void> {
    if (!this.repository) return;
    this.applyState(await this.readStoredState());
    if (this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  private applyState(state: IdentityAccessState): void {
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
    for (const encrypted of state.encryptedCredentials) this.encryptedCredentials.set(encrypted.userId, encrypted.encrypted);
    for (const session of state.sessions) this.sessions.set(session.id, session);
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
      const encrypted = this.tryEncryptCredential(credential);
      if (!encrypted) continue;
      await this.repository.put(identityRecord(`credential:${credential.userId}`, "credential", {
        recordType: "credential",
        encrypted: true,
        metadata: credentialMetadata(credential) as unknown as JsonObject,
        sealed: encrypted as unknown as JsonObject
      }, now));
      this.credentialMetadata.set(credential.userId, credentialMetadata(credential));
      this.encryptedCredentials.set(credential.userId, encrypted);
    }
    for (const session of this.sessions.values()) {
      await this.repository.put(identityRecord(`session:${session.id}`, "session", { recordType: "session", session: session as unknown as JsonObject }, now));
    }
    await this.repository.put(identityRecord("vault", "vault", { recordType: "vault", vault: this.vault as unknown as JsonObject }, now));
  }

  private async ensurePinVerifierMetadata(credential: UserCredential): Promise<void> {
    if (!credential.pinHash) return;
    const metadata = this.credentialMetadata.get(credential.userId);
    if (metadata?.pinVerifierHash === credential.pinHash) return;
    this.credentialMetadata.set(credential.userId, credentialMetadata(credential));
    await this.persist();
  }

  private async readStoredState(): Promise<IdentityAccessState> {
    if (!this.repository) return { users: [], roles: [], credentials: [], credentialMetadata: [], encryptedCredentials: [], sessions: [], vault: { initialized: false, unlocked: false }, vaultRecords: [] };
    const records = await this.repository.list({});
    const state: IdentityAccessState = {
      users: [],
      roles: [],
      credentials: [],
      credentialMetadata: [],
      encryptedCredentials: [],
      sessions: [],
      vault: { initialized: false, unlocked: false },
      vaultRecords: []
    };
    for (const item of records) {
      if (item.data.recordType === "user" && isObject(item.data.user)) {
        state.users.push(item.data.user as unknown as User);
      } else if (item.data.recordType === "role" && isObject(item.data.role)) {
        state.roles.push(item.data.role as unknown as Role);
      } else if (item.data.recordType === "credential" && item.data.encrypted === true && isObject(item.data.metadata) && isEncryptedCredentialRecord(item.data.sealed)) {
        state.credentialMetadata.push(item.data.metadata as unknown as CredentialMetadata);
        state.encryptedCredentials.push({ userId: String(item.data.metadata.userId), encrypted: item.data.sealed });
      } else if (item.data.recordType === "credential" && isObject(item.data.credential)) {
        state.credentials.push(item.data.credential as unknown as UserCredential);
        state.credentialMetadata.push(credentialMetadata(item.data.credential as unknown as UserCredential));
      } else if (item.data.recordType === "session" && isObject(item.data.session)) {
        state.sessions.push(item.data.session as unknown as Session);
      } else if (item.data.recordType === "vault" && isObject(item.data.vault)) {
        state.vault = item.data.vault as unknown as VaultStatus;
      }
    }
    return state;
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

  private setCredentialHash(userId: string, key: "passwordHash" | "pinHash", value: string): UserCredential {
    const credential = this.requireCredential(userId);
    credential[key] = hashSecret(value);
    credential.updatedAtMs = Date.now();
    this.credentials.set(userId, credential);
    if (key === "passwordHash") {
      this.credentialKeys.set(userId, deriveCredentialKey(value));
    }
    this.credentialMetadata.set(userId, credentialMetadata(credential));
    return credential;
  }

  private verifyCredentialGate(userId: string, params: { password: string; pin: string; totp: string | undefined }): void {
    const credential = this.unlockCredentialWithPassword(userId, params.password);
    const passwordOk = verifySecret(params.password, credential.passwordHash);
    const pinOk = credential.pinHash ? verifySecret(params.pin, credential.pinHash) : true;
    const totpOk = credential.totpSecret ? verifyTotp(credential.totpSecret, params.totp ?? "") : true;
    if (!passwordOk || !pinOk || !totpOk) throw new Error("Invalid username or credentials");
  }

  private unlockCredentialWithPassword(userId: string, password: string): UserCredential {
    const existing = this.credentials.get(userId);
    if (existing && verifySecret(password, existing.passwordHash)) {
      if (!this.credentialKeys.has(userId)) this.credentialKeys.set(userId, deriveCredentialKey(password));
      return existing;
    }
    const sealed = this.encryptedCredentials.get(userId);
    if (!sealed) return this.requireCredential(userId);
    try {
      const credential = decryptCredential(sealed, password);
      if (credential.userId !== userId || !verifySecret(password, credential.passwordHash)) {
        throw new Error("Invalid credential payload");
      }
      this.credentials.set(userId, credential);
      this.credentialMetadata.set(userId, credentialMetadata(credential));
      this.credentialKeys.set(userId, { salt: sealed.salt, key: deriveCredentialKey(password, sealed.salt).key });
      return credential;
    } catch {
      throw new Error("Invalid username or credentials");
    }
  }

  private tryEncryptCredential(credential: UserCredential): EncryptedCredentialRecord | null {
    let key = this.credentialKeys.get(credential.userId);
    if (!key) {
      const existing = this.encryptedCredentials.get(credential.userId);
      if (existing) return existing;
      return null;
    }
    const encrypted = encryptCredential(credential, key);
    this.credentialKeys.set(credential.userId, { salt: encrypted.salt, key: key.key });
    return encrypted;
  }

  private ensureDefaultAdmin(): boolean {
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
    this.setCredentialHash(user.id, "passwordHash", "admin");
    return true;
  }
}

function identityRecord(id: string, stateKind: string, data: JsonObject, nowMs: number): RecordEnvelope {
  return {
    id,
    kind: "identity.users",
    scope: {},
    data: {
      stateKind,
      ...data
    },
    createdAtMs: nowMs,
    updatedAtMs: nowMs
  };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hashSecret(value: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(value, salt, 32).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifySecret(value: string, encoded: string | undefined): boolean {
  if (!encoded) return false;
  const [, salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(value, salt, 32).toString("base64url"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function credentialMetadata(credential: UserCredential): CredentialMetadata {
  return {
    userId: credential.userId,
    passwordConfigured: Boolean(credential.passwordHash),
    pinConfigured: Boolean(credential.pinHash),
    ...(credential.pinHash ? { pinVerifierHash: credential.pinHash } : {}),
    totpConfigured: Boolean(credential.totpSecret),
    pendingTotpConfigured: Boolean(credential.pendingTotpSecret),
    updatedAtMs: credential.updatedAtMs
  };
}

function deriveCredentialKey(password: string, salt = randomBytes(16).toString("base64url")): CredentialKey {
  return {
    salt,
    key: scryptSync(password, salt, 32)
  };
}

function encryptCredential(credential: UserCredential, credentialKey: CredentialKey): EncryptedCredentialRecord {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credential), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: credentialKey.salt,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decryptCredential(sealed: EncryptedCredentialRecord, password: string): UserCredential {
  const credentialKey = deriveCredentialKey(password, sealed.salt);
  const decipher = createDecipheriv("aes-256-gcm", credentialKey.key, Buffer.from(sealed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!isObject(parsed) || typeof parsed.userId !== "string" || typeof parsed.updatedAtMs !== "number") {
    throw new Error("Invalid encrypted credential payload");
  }
  return parsed as unknown as UserCredential;
}

function isEncryptedCredentialRecord(value: unknown): value is EncryptedCredentialRecord {
  if (!isObject(value)) return false;
  return value.version === 1
    && value.algorithm === "aes-256-gcm"
    && value.kdf === "scrypt"
    && typeof value.salt === "string"
    && typeof value.iv === "string"
    && typeof value.tag === "string"
    && typeof value.ciphertext === "string";
}

function base32(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  let output = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const raw of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(raw);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  const clean = code.trim().replace(/\s+/g, "");
  return [-1, 0, 1].some((offset) => totp(secret, Math.floor(nowMs / 30_000) + offset) === clean);
}

function totp(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0xf;
  const binary = (((digest.at(offset) ?? 0) & 0x7f) << 24) | (((digest.at(offset + 1) ?? 0) & 0xff) << 16) | (((digest.at(offset + 2) ?? 0) & 0xff) << 8) | ((digest.at(offset + 3) ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}
