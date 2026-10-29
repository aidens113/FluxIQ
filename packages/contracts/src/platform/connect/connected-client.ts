import { z } from "zod";
import { CLIENT_GATEWAY_REVOCATION_REASONS } from "../gateway/index.ts";
import { isSessionDigest } from "../session/index.ts";

const identifier = z.string().min(1).max(128);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const epochMs = z.number().int().nonnegative();
const shortText = z.string().min(1).max(100);
const ipPrefix = z.string().regex(/^[0-9A-Fa-f:.]{2,39}\/\d{1,3}$/u);

/**
 * A connected client's credential record (evolves
 * `client-gateway/service/trusted-clients.ts`): one connected browser in the
 * plan's words, named for the gateway's generic client vocabulary.
 *
 * - `connectedClientId`: the record's id (`gateway:browser/<id>` in IAM);
 * - `userId`, `workspaceId`: the user it acts as and their workspace; it acts
 *   under the session policy `FluxIQBrowserSession`;
 * - `clientId`, `domainId`: as the client's hello declared them;
 *   `clientInstallId`: the install id the connect flow bound (null for a
 *   migrated trusted client), so a reconnect from the same install replaces
 *   its record rather than adding one;
 * - `label`, `runtime`, `os`: what the person sees in their client list
 *   (`runtime` is the software the client runs in and its version);
 * - `lastIpPrefix`: the last source address, as an audited prefix;
 * - `credentialHash`, `previousCredentialHash`, `previousValidUntil`: SHA-256
 *   hex of the current credential and of the one the last connect replaced,
 *   valid once until `previousValidUntil`;
 * - `approvingSessionId`: the approving panel session's digest
 *   (`isSessionDigest`), for audit only and never a key handle: the session ends
 *   within 12 hours and the credential lasts 60 days; null for a migrated
 *   trusted client.
 *
 * Times are epoch milliseconds. Unknown fields are refused.
 */
export const connectedClientRecordSchema = z
  .object({
    connectedClientId: identifier,
    userId: identifier,
    workspaceId: identifier,
    clientId: identifier,
    clientInstallId: identifier.nullable(),
    domainId: identifier.nullable(),
    label: shortText,
    runtime: shortText.nullable(),
    os: shortText.nullable(),
    createdAt: epochMs,
    lastSeenAt: epochMs,
    lastIpPrefix: ipPrefix.nullable(),
    credentialHash: sha256Hex,
    previousCredentialHash: sha256Hex.nullable(),
    previousValidUntil: epochMs.nullable(),
    expiresAt: epochMs,
    revokedAt: epochMs.nullable(),
    revocationReason: z.enum(CLIENT_GATEWAY_REVOCATION_REASONS).nullable(),
    approvingSessionId: z.string().refine(isSessionDigest, "a session digest, never a raw session id").nullable()
  })
  .strict()
  .superRefine((record, context) => {
    if ((record.previousCredentialHash === null) !== (record.previousValidUntil === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["previousValidUntil"], message: "a previous credential and its validity go together" });
    }
    if ((record.revokedAt === null) !== (record.revocationReason === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["revocationReason"], message: "a revocation and its reason go together" });
    }
  });

export type ConnectedClientRecord = z.infer<typeof connectedClientRecordSchema>;

/** A connected client's state at a moment. */
export type ConnectedClientStatus = "active" | "expired" | "revoked";

/** What the account's client list shows: the record without its hashes or session digest. */
export type ConnectedClientView = Omit<ConnectedClientRecord, "credentialHash" | "previousCredentialHash" | "previousValidUntil" | "approvingSessionId"> & {
  status: ConnectedClientStatus;
};

/** The record's status at `now` (epoch milliseconds): revoked wins over expired. */
export function connectedClientStatus(record: Pick<ConnectedClientRecord, "revokedAt" | "expiresAt">, now: number): ConnectedClientStatus {
  if (record.revokedAt !== null) return "revoked";
  return record.expiresAt <= now ? "expired" : "active";
}

/** The list view of a record at `now`. */
export function connectedClientView(record: ConnectedClientRecord, now: number): ConnectedClientView {
  return {
    connectedClientId: record.connectedClientId,
    userId: record.userId,
    workspaceId: record.workspaceId,
    clientId: record.clientId,
    clientInstallId: record.clientInstallId,
    domainId: record.domainId,
    label: record.label,
    runtime: record.runtime,
    os: record.os,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    lastIpPrefix: record.lastIpPrefix,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    revocationReason: record.revocationReason,
    status: connectedClientStatus(record, now)
  };
}
