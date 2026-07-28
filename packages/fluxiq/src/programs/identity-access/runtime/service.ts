import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import { defaultRoles } from "./roles";
import type { IdentityAccessSnapshot, Role, Session, User, UserCredential, VaultRecord, VaultStatus } from "../types";

type IdentityAccessState = {
  users: User[];
  roles: Role[];
  credentials: UserCredential[];
  sessions: Session[];
  vault: VaultStatus;
  vaultRecords: VaultRecord[];
};

export class TotpRequiredError extends Error {
  constructor(message = "Authenticator code required") {
    super(message);
    this.name = "TotpRequiredError";
  }
}

export class IdentityAccessService {
  private readonly users = new Map<string, User>();
  private readonly roles = new Map<string, Role>();
  private readonly credentials = new Map<string, UserCredential>();
  private readonly sessions = new Map<string, Session>();
  private vault: VaultStatus = { initialized: false, unlocked: false };
  private readonly store?: ProgramJsonStore<IdentityAccessState>;
  private loaded = false;

  constructor(options: { dataDir?: string; roles?: Role[] } = {}) {
    const roles = options.roles ?? defaultRoles;
    for (const role of roles) {
      this.roles.set(role.id, role);
    }
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "identity-access", "state.json"), () => ({
        users: [],
        roles,
        credentials: [],
        sessions: [],
        vault: { initialized: false, unlocked: false },
        vaultRecords: []
      }));
    }
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
    await this.authorizeCredentialRotation({
      targetUserId: params.userId,
      sessionId: params.sessionId,
      password: params.authorizationPassword,
      pin: params.authorizationPin,
      totp: params.authorizationTotp
    });
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
    const credential = this.requireCredential(user.id);
    const passwordOk = verifySecret(params.password, credential.passwordHash);
    if (!passwordOk) throw new Error("Invalid username or credentials");
    if (credential.totpSecret && !verifyTotp(credential.totpSecret, params.totp ?? "")) {
      throw new TotpRequiredError(params.totp ? "Authenticator code failed" : "Authenticator code required");
    }
    const session = await this.createSession(user.id, params.ttlMs, params.nowMs);
    const role = this.roles.get(user.roleId);
    if (!role) throw new Error(`Unknown role: ${user.roleId}`);
    return { session, user, role };
  }

  async createSession(userId: string, ttlMs = 3_600_000, nowMs = Date.now()): Promise<Session> {
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
    if (!session && this.store) {
      await this.reloadFromStore();
      session = this.sessions.get(sessionId);
    }
    if (!session || session.expiresAtMs <= nowMs) return null;
    const user = this.users.get(session.userId);
    if (!user || !user.enabled) return null;
    const role = this.roles.get(user.roleId);
    if (!role) return null;
    return { session, user, role };
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
      users: [...this.users.values()].sort((left, right) => left.username.localeCompare(right.username)),
      roles: [...this.roles.values()].sort((left, right) => left.id.localeCompare(right.id)),
      sessions,
      vault: this.vault
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store) {
      this.ensureDefaultAdmin();
      return;
    }
    const state = await this.store.read();
    this.applyState(state);
    if (this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  private async reloadFromStore(): Promise<void> {
    if (!this.store) return;
    this.applyState(await this.store.read());
    if (this.ensureDefaultAdmin()) {
      await this.persist();
    }
  }

  private applyState(state: IdentityAccessState): void {
    this.users.clear();
    this.roles.clear();
    this.credentials.clear();
    this.sessions.clear();
    for (const role of state.roles.length ? state.roles : defaultRoles) this.roles.set(role.id, role);
    for (const user of state.users) this.users.set(user.id, user);
    for (const credential of state.credentials) this.credentials.set(credential.userId, credential);
    for (const session of state.sessions) this.sessions.set(session.id, session);
    this.vault = state.vault ?? { initialized: false, unlocked: false };
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write({
      users: [...this.users.values()],
      roles: [...this.roles.values()],
      credentials: [...this.credentials.values()],
      sessions: [...this.sessions.values()],
      vault: this.vault,
      vaultRecords: []
    });
  }

  private requireUser(userId: string): User {
    const user = this.users.get(userId);
    if (!user || !user.enabled) throw new Error(`Unknown or disabled user: ${userId}`);
    return user;
  }

  private requireCredential(userId: string): UserCredential {
    this.requireUser(userId);
    return this.credentials.get(userId) ?? { userId, updatedAtMs: Date.now() };
  }

  private setCredentialHash(userId: string, key: "passwordHash" | "pinHash", value: string): UserCredential {
    const credential = this.requireCredential(userId);
    credential[key] = hashSecret(value);
    credential.updatedAtMs = Date.now();
    this.credentials.set(userId, credential);
    return credential;
  }

  private verifyCredentialGate(userId: string, params: { password: string; pin: string; totp: string | undefined }): void {
    const credential = this.requireCredential(userId);
    const passwordOk = verifySecret(params.password, credential.passwordHash);
    const pinOk = verifySecret(params.pin, credential.pinHash);
    const totpOk = credential.totpSecret ? verifyTotp(credential.totpSecret, params.totp ?? "") : true;
    if (!passwordOk || !pinOk || !totpOk) throw new Error("Invalid username or credentials");
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
    this.setCredentialHash(user.id, "pinHash", "1234");
    return true;
  }
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
