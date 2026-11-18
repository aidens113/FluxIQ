// An endpoint may opt in (`auditOutcome`) to one more audit row that says what
// its handler did. The decision row is unchanged, and an endpoint that does
// not opt in records exactly what it always did.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiHandler, type ProgramApiRegistrationParams } from "../api.ts";
import { endpointResource } from "../iam/index.ts";
import { actor, ADMIN_PERMISSIONS, pinAcceptingIdentityAccess, recordingSink } from "./iam-registry-fixtures.ts";

function setup(handler: ProgramApiHandler, optIn: boolean) {
  const audit = recordingSink();
  const built = new GlobalProgramApiRegistry({ identityAccess: pinAcceptingIdentityAccess, iam: { audit } });
  const registration: ProgramApiRegistrationParams = {
    programId: "automation-studio",
    endpoint: "save-flow",
    permission: "programs.write",
    classification: "authoring",
    action: "studio:SaveFlow",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler,
    ...(optIn ? { auditOutcome: true } : {})
  };
  built.register(registration);
  const run = () => built.call({ programId: "automation-studio", endpoint: "save-flow", scope: {}, actor: actor("admin.one", "admin", ADMIN_PERMISSIONS), payload: { secret: "sk-live-123" } });
  return { audit, run };
}

describe("auditOutcome", () => {
  it("records the decision plus a failed outcome, with the error code only, when the handler fails", async () => {
    const { audit, run } = setup(() => ({ ok: false, error: "bad key sk-live-123", errorCode: "key.invalid" }), true);
    expect((await run()).ok).toBe(false);
    expect(audit.records).toHaveLength(2);
    const [decision, outcome] = audit.records;
    expect(decision).not.toHaveProperty("outcome");
    expect(outcome?.outcome).toEqual({ result: "failed", errorKind: "key.invalid" });
    expect(outcome?.requestId).toBe(decision?.requestId);
    expect(JSON.stringify(audit.records)).not.toContain("sk-live-123");
    expect(audit.records.some((record) => record.outcome?.result === "succeeded")).toBe(false);
  });

  it("records a thrown error as failed with a generic kind, never its text", async () => {
    const { audit, run } = setup(() => { throw new Error("leaks sk-live-123"); }, true);
    expect((await run()).ok).toBe(false);
    expect(audit.records[1]?.outcome).toEqual({ result: "failed", errorKind: "error" });
    expect(JSON.stringify(audit.records)).not.toContain("sk-live-123");
  });

  it("records a success once", async () => {
    const { audit, run } = setup(() => ({ ok: true, payload: {} }), true);
    expect((await run()).ok).toBe(true);
    expect(audit.records).toHaveLength(2);
    expect(audit.records.filter((record) => record.outcome !== undefined)).toHaveLength(1);
    expect(audit.records[1]?.outcome).toEqual({ result: "succeeded" });
  });

  it("records nothing extra for an endpoint that did not opt in", async () => {
    for (const handler of [(() => ({ ok: true })) as ProgramApiHandler, (() => ({ ok: false, error: "x", errorCode: "a.b" })) as ProgramApiHandler]) {
      const { audit, run } = setup(handler, false);
      await run();
      expect(audit.records).toHaveLength(1);
      expect(audit.records[0]).not.toHaveProperty("outcome");
    }
  });
});
