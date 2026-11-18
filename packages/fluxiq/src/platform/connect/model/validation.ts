import { connectFieldSchemas, connectUserSummarySchema, connectWorkspaceSummarySchema, isSessionDigest } from "@fluxiq/contracts/platform";
import type { ConnectApprovalEligibility, ConnectCodeClaim, ConnectCodeRecord } from "./types.ts";

const recordKeys = ["codeDigest", "clientId", "clientInstallId", "redirectUri", "codeChallenge", "userId", "workspaceId", "approvingSessionDigest", "clientLabel", "createdAt", "expiresAt"];
const claimKeys = ["codeDigest", "clientId", "clientInstallId", "redirectUri", "codeChallenge", "now"];

function objectWithKeys(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) && Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}

function epoch(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function proofFields(input: Record<string, unknown>): boolean {
  return typeof input.codeDigest === "string" && /^[a-f0-9]{64}$/u.test(input.codeDigest)
    && connectFieldSchemas.clientId.safeParse(input.clientId).success
    && connectFieldSchemas.installId.safeParse(input.clientInstallId).success
    && connectFieldSchemas.redirectUri.safeParse(input.redirectUri).success
    && connectFieldSchemas.codeChallenge.safeParse(input.codeChallenge).success;
}

/** Generic errors deliberately omit parse details, which could contain authorization evidence. */
export function validateConnectCodeRecord(input: unknown): ConnectCodeRecord {
  if (!objectWithKeys(input, recordKeys) || !proofFields(input) || !identifier(input.userId) || !identifier(input.workspaceId) || !isSessionDigest(input.approvingSessionDigest)
    || !connectFieldSchemas.label.safeParse(input.clientLabel).success || !epoch(input.createdAt) || !epoch(input.expiresAt) || input.expiresAt <= input.createdAt) throw new TypeError("Invalid connect authorization evidence.");
  return { ...input } as ConnectCodeRecord;
}

export function validateConnectCodeClaim(input: unknown): ConnectCodeClaim {
  if (!objectWithKeys(input, claimKeys) || !proofFields(input) || !epoch(input.now)) throw new TypeError("Invalid connect authorization claim.");
  return { ...input } as ConnectCodeClaim;
}

export function validateConnectEligibility(input: unknown): ConnectApprovalEligibility {
  if (typeof input === "object" && input !== null && "allowed" in input) {
    if (input.allowed === true && "user" in input && "workspace" in input) {
      const user = connectUserSummarySchema.safeParse(input.user);
      const workspace = connectWorkspaceSummarySchema.safeParse(input.workspace);
      if (user.success && workspace.success) return { allowed: true, user: user.data, workspace: workspace.data };
    }
    if (input.allowed === false && "error" in input && (input.error === "invalid_grant" || input.error === "email_unverified" || input.error === "account_disabled" || input.error === "client_limit_reached")) return { allowed: false, error: input.error };
  }
  throw new TypeError("Invalid connect approval authority.");
}
