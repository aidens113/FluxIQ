// The provisioning API: every operation's input and result, the HTTP rules
// (no password ever travels, setPassword is in-process only), the IAM action
// each one is audited as, and the typed error envelope.
import { describe, expect, it } from "vitest";
import {
  PLATFORM_PROVISIONING_ERROR_STATUS,
  PLATFORM_PROVISIONING_OPERATIONS,
  platformProvisioningResponseSchema,
  provisioningOperationForHttpPath,
  type PlatformProvisioningOperationName
} from "../index.ts";

const VALID_INPUTS: Record<PlatformProvisioningOperationName, unknown> = {
  createAccount: { requestId: "req-1", email: "Ada@Example.com ", displayName: " Ada ", policies: ["FluxIQUserAccess"], workspace: "new", sendWelcome: true, continueUrl: "/connect/authorize?state=x" },
  sendWelcome: { requestId: "req-2", email: "ada@example.com" },
  setPassword: { requestId: "req-3", userId: "u1", password: "correct horse battery staple" },
  setPolicies: { requestId: "req-4", userId: "u1", workspaceId: "ws-1", policies: ["FluxIQReadOnlyAccess"] },
  addMember: { requestId: "req-5", userId: "u1", workspaceId: "org-1", policies: ["FluxIQUserAccess"] },
  disableAccount: { requestId: "req-6", userId: "u1", reason: "Abuse report 42" },
  enableAccount: { requestId: "req-7", userId: "u1", reason: "Appeal granted" },
  deleteAccount: { requestId: "req-8", userId: "u1", mode: "immediate" },
  rotateCredentials: { requestId: "req-9", userId: "u1", scope: "all" },
  getAccount: { externalId: "site-user-9" }
};

const VALID_RESULTS: Record<PlatformProvisioningOperationName, unknown> = {
  createAccount: { status: "created", userId: "u1", workspaceId: "ws-1" },
  sendWelcome: { status: "accepted" },
  setPassword: { status: "updated", sessionsRevoked: 2 },
  setPolicies: { status: "updated", userId: "u1", workspaceId: "ws-1", policies: ["FluxIQReadOnlyAccess"] },
  addMember: { status: "already_member", userId: "u1", workspaceId: "org-1", policies: ["FluxIQUserAccess"] },
  disableAccount: { status: "disabled", userId: "u1" },
  enableAccount: { status: "enabled", userId: "u1" },
  deleteAccount: { status: "deleted", receipt: { receiptId: "rcpt-1", userId: "u1", mode: "immediate", requestedAt: 1, scheduledFor: null, completedAt: 2, workspaceIds: ["ws-1"] } },
  rotateCredentials: { status: "rotated", userId: "u1", sessionsRevoked: 1, connectedClientsRevoked: 3, resetSent: true },
  getAccount: { userId: "u1", email: "ada@example.com", status: "active", workspaceIds: ["ws-1"], createdAt: 1, lastSignInAt: null }
};

const NAMES = Object.keys(PLATFORM_PROVISIONING_OPERATIONS) as PlatformProvisioningOperationName[];

function globMatches(pattern: string, value: string): boolean {
  const source = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*").replace(/\?/gu, ".");
  return new RegExp(`^${source}$`, "u").test(value);
}

describe("provisioning operations", () => {
  it.each(NAMES)("%s accepts its input and result", (name) => {
    const operation = PLATFORM_PROVISIONING_OPERATIONS[name];
    expect(operation.input.safeParse(VALID_INPUTS[name]).success).toBe(true);
    expect(operation.result.safeParse(VALID_RESULTS[name]).success).toBe(true);
  });

  it.each(NAMES)("%s refuses an unknown field", (name) => {
    const input = VALID_INPUTS[name] as Record<string, unknown>;
    expect(PLATFORM_PROVISIONING_OPERATIONS[name].input.safeParse({ ...input, surprise: 1 }).success).toBe(false);
  });

  it("normalises email and display name", () => {
    const parsed = PLATFORM_PROVISIONING_OPERATIONS.createAccount.input.parse(VALID_INPUTS.createAccount);
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.displayName).toBe("Ada");
  });

  it("is audited as platform actions that FluxIQProvisioner's platform:*Account* covers exactly", () => {
    const actions = NAMES.map((name) => PLATFORM_PROVISIONING_OPERATIONS[name].action);
    expect(new Set(actions).size).toBe(actions.length);
    for (const action of actions) expect(globMatches("platform:*Account*", action)).toBe(true);
  });

  it("never lets a password travel over HTTP", () => {
    const httpCreate = PLATFORM_PROVISIONING_OPERATIONS.createAccount.httpInput;
    expect(httpCreate.safeParse(VALID_INPUTS.createAccount).success).toBe(true);
    expect(httpCreate.safeParse({ ...(VALID_INPUTS.createAccount as object), password: "pw" }).success).toBe(false);
    expect(PLATFORM_PROVISIONING_OPERATIONS.createAccount.input.safeParse({ ...(VALID_INPUTS.createAccount as object), password: "pw" }).success).toBe(true);
    expect(PLATFORM_PROVISIONING_OPERATIONS.setPassword.http).toBe(false);
    expect(PLATFORM_PROVISIONING_OPERATIONS.setPassword.httpInput).toBeNull();
  });

  it("maps listener paths to HTTP operations only", () => {
    expect(provisioningOperationForHttpPath("/provisioning/createAccount")).toBe("createAccount");
    expect(provisioningOperationForHttpPath("/provisioning/getAccount")).toBe("getAccount");
    expect(provisioningOperationForHttpPath("/provisioning/setPassword")).toBeNull();
    expect(provisioningOperationForHttpPath("/provisioning/toString")).toBeNull();
    expect(provisioningOperationForHttpPath("/provisioning/")).toBeNull();
    expect(provisioningOperationForHttpPath("/api/createAccount")).toBeNull();
  });

  it.each([
    ["createAccount", { requestId: "req 1", email: "ada@example.com", displayName: "Ada", policies: ["FluxIQUserAccess"], workspace: "new" }],
    ["createAccount", { requestId: "req-1", email: "not-an-email", displayName: "Ada", policies: ["FluxIQUserAccess"], workspace: "new" }],
    ["createAccount", { requestId: "req-1", email: "ada@example.com", displayName: "  ", policies: ["FluxIQUserAccess"], workspace: "new" }],
    ["createAccount", { requestId: "req-1", email: "ada@example.com", displayName: "Ada", policies: [], workspace: "new" }],
    ["createAccount", { requestId: "req-1", email: "ada@example.com", displayName: "Ada", policies: ["FluxIQUserAccess"], workspace: "new", continueUrl: "https://evil.example/" }],
    ["createAccount", { requestId: "req-1", email: "ada@example.com", displayName: "Ada", policies: ["FluxIQUserAccess"], workspace: "ws/1" }],
    ["sendWelcome", { requestId: "req-2", userId: "u1", email: "ada@example.com" }],
    ["sendWelcome", { requestId: "req-2" }],
    ["deleteAccount", { requestId: "req-8", userId: "u1", mode: "later" }],
    ["rotateCredentials", { requestId: "req-9", userId: "u1", scope: "keys" }],
    ["disableAccount", { requestId: "req-6", userId: "u1" }],
    ["getAccount", { userId: "u1", email: "ada@example.com" }],
    ["getAccount", {}],
    ["setPolicies", { requestId: "req-4", userId: "u1", workspaceId: "ws-1", policies: ["not a policy"] }]
  ] as const)("%s refuses %j", (name, input) => {
    expect(PLATFORM_PROVISIONING_OPERATIONS[name].input.safeParse(input).success).toBe(false);
  });

  it("holds the deletion receipt to its status", () => {
    const result = PLATFORM_PROVISIONING_OPERATIONS.deleteAccount.result;
    const receipt = { receiptId: "r", userId: "u1", mode: "scheduled", requestedAt: 1, workspaceIds: [] };
    expect(result.safeParse({ status: "scheduled", receipt: { ...receipt, scheduledFor: 5, completedAt: null } }).success).toBe(true);
    expect(result.safeParse({ status: "scheduled", receipt: { ...receipt, scheduledFor: null, completedAt: null } }).success).toBe(false);
    expect(result.safeParse({ status: "deleted", receipt: { ...receipt, scheduledFor: null, completedAt: null } }).success).toBe(false);
  });

  it("returns no id for an existing email", () => {
    const result = PLATFORM_PROVISIONING_OPERATIONS.createAccount.result;
    expect(result.safeParse({ status: "exists" }).success).toBe(true);
    expect(result.safeParse({ status: "exists", userId: "u1" }).success).toBe(false);
  });
});

describe("provisioning errors", () => {
  it("maps the plan's typed errors to statuses", () => {
    expect(PLATFORM_PROVISIONING_ERROR_STATUS).toMatchObject({ email_taken: 409, weak_password: 422, not_found: 404, disabled: 409, forbidden_policy: 403 });
  });

  it("has a code for the last administrator, one for a sealed two-factor account and one for an unexpected failure", () => {
    expect(PLATFORM_PROVISIONING_ERROR_STATUS).toMatchObject({ last_administrator: 409, two_factor: 409, internal_error: 500 });
    expect(platformProvisioningResponseSchema(PLATFORM_PROVISIONING_OPERATIONS.setPassword.result).safeParse({ ok: false, error: { code: "two_factor", message: "An administrator must reset this account." } }).success).toBe(true);
    const schema = platformProvisioningResponseSchema(PLATFORM_PROVISIONING_OPERATIONS.disableAccount.result);
    expect(schema.safeParse({ ok: false, error: { code: "last_administrator", message: "The last enabled administrator cannot be disabled." } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "internal_error", message: "The provisioning request could not be completed." } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "server_error", message: "Not a contract code." } }).success).toBe(false);
  });

  it("wraps results and errors in one envelope", () => {
    const schema = platformProvisioningResponseSchema(PLATFORM_PROVISIONING_OPERATIONS.getAccount.result);
    expect(schema.safeParse({ ok: true, result: VALID_RESULTS.getAccount }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "not_found", message: "No such account." } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "invalid_input", message: "Bad body.", issues: [{ path: "email", message: "Invalid email" }] } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: "exploded", message: "?" } }).success).toBe(false);
    expect(schema.safeParse({ ok: true, result: VALID_RESULTS.getAccount, error: { code: "not_found", message: "x" } }).success).toBe(false);
  });
});
