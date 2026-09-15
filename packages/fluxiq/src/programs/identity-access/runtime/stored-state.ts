// The identity store's record formats: reads stored users, roles, sealed
// credentials, sessions, and the vault into memory, and builds the records the
// service writes back.

import type { JsonObject } from "../../../core/index.ts";
import type { RecordEnvelope, Repository } from "../../database-manager/index.ts";
import type { Role, User, UserCredential, VaultRecord, VaultStatus } from "../types.ts";
import { isSealedCredentialRecord, type SealedCredentialRecord } from "./credential-seal.ts";

export type IdentityAccessState = {
  users: User[];
  roles: Role[];
  credentials: UserCredential[];
  credentialMetadata: CredentialMetadata[];
  encryptedCredentials: Array<{ userId: string; encrypted: SealedCredentialRecord }>;
  sessions: StoredSession[];
  vault: VaultStatus;
  vaultRecords: VaultRecord[];
  /** Session records stored under the raw id, a bearer value: ignored, and deleted at first load. */
  rawSessionRecordIds: string[];
  /** Credential records that still carry a persisted PIN verifier: rewritten without it at first load. */
  pinVerifierRecords: RecordEnvelope[];
};

/** Non-secret credential facts. No PIN verifier: PINs verify only against a credential unlocked in memory. */
export type CredentialMetadata = {
  userId: string;
  passwordConfigured: boolean;
  pinConfigured: boolean;
  totpConfigured: boolean;
  pendingTotpConfigured: boolean;
  updatedAtMs: number;
};

/** A session as held and stored: under the SHA-256 digest of its id, never the id itself. */
export type StoredSession = {
  digest: string;
  userId: string;
  expiresAtMs: number;
};

export async function readStoredState(repository: Repository): Promise<IdentityAccessState> {
  const records = await repository.list({});
  const state: IdentityAccessState = {
    users: [],
    roles: [],
    credentials: [],
    credentialMetadata: [],
    encryptedCredentials: [],
    sessions: [],
    vault: { initialized: false, unlocked: false },
    vaultRecords: [],
    rawSessionRecordIds: [],
    pinVerifierRecords: []
  };
  for (const item of records) {
    const data = item.data;
    if (data.recordType === "user" && isObject(data.user)) {
      state.users.push(data.user as unknown as User);
    } else if (data.recordType === "role" && isObject(data.role)) {
      state.roles.push(data.role as unknown as Role);
    } else if (data.recordType === "credential" && data.encrypted === true && isObject(data.metadata) && isSealedCredentialRecord(data.sealed)) {
      const metadata = storedCredentialMetadata(data.metadata);
      state.credentialMetadata.push(metadata);
      state.encryptedCredentials.push({ userId: metadata.userId, encrypted: data.sealed });
      if ("pinVerifierHash" in data.metadata) {
        state.pinVerifierRecords.push({ ...item, data: { ...data, metadata: metadata as unknown as JsonObject } });
      }
    } else if (data.recordType === "credential" && isObject(data.credential)) {
      const credential = data.credential as unknown as UserCredential;
      state.credentials.push(credential);
      state.credentialMetadata.push(credentialMetadata(credential));
    } else if (data.recordType === "session" && isObject(data.sessionDigest)) {
      const stored = data.sessionDigest;
      if (typeof stored.digest === "string" && typeof stored.userId === "string" && typeof stored.expiresAtMs === "number") {
        state.sessions.push({ digest: stored.digest, userId: stored.userId, expiresAtMs: stored.expiresAtMs });
      }
    } else if (data.recordType === "session" && isObject(data.session)) {
      state.rawSessionRecordIds.push(item.id);
    } else if (data.recordType === "vault" && isObject(data.vault)) {
      state.vault = data.vault as unknown as VaultStatus;
    }
  }
  return state;
}

export function identityRecord(id: string, stateKind: string, data: JsonObject, nowMs: number): RecordEnvelope {
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

export function credentialMetadata(credential: UserCredential): CredentialMetadata {
  return {
    userId: credential.userId,
    passwordConfigured: Boolean(credential.passwordHash),
    pinConfigured: Boolean(credential.pinHash),
    totpConfigured: Boolean(credential.totpSecret),
    pendingTotpConfigured: Boolean(credential.pendingTotpSecret),
    updatedAtMs: credential.updatedAtMs
  };
}

/** Metadata read from a stored record, rebuilt field by field so a persisted PIN verifier is dropped. */
function storedCredentialMetadata(value: JsonObject): CredentialMetadata {
  return {
    userId: String(value.userId),
    passwordConfigured: value.passwordConfigured === true,
    pinConfigured: value.pinConfigured === true,
    totpConfigured: value.totpConfigured === true,
    pendingTotpConfigured: value.pendingTotpConfigured === true,
    updatedAtMs: typeof value.updatedAtMs === "number" ? value.updatedAtMs : 0
  };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
