import { describe, expect, it } from "vitest";
import { appGrantCovers, parseAppGrant, parseAppInvocation, parseAppOperation, parseAppOperationResolution, validateAppOperationInputs, validateAppOperationResult } from "../../../apps.ts";
import { executionOperation, queryOperation, resolutionFixture } from "../../tests/fixtures.ts";

describe("app operations and requested capabilities", () => {
  it("distinguishes existing dataset queries from bound execution", () => {
    expect(parseAppOperation(queryOperation()).ok).toBe(true);
    expect(parseAppOperation(executionOperation()).ok).toBe(true);
    expect(parseAppOperation({ ...queryOperation(), kind: "execution" }).ok).toBe(false);
    expect(parseAppOperation({ ...executionOperation(), kind: "query" }).ok).toBe(false);
    expect(parseAppOperation({ ...queryOperation(), requestedGrants: [] }).ok).toBe(false);
    expect(parseAppOperation({ ...queryOperation(), requestedGrants: executionOperation().requestedGrants }).ok).toBe(false);
  });

  it("requires the exact execution binding and rejects inline source and arbitrary options", () => {
    const operation = executionOperation();
    expect(parseAppOperation({ ...operation, binding: { ...operation.binding, id: "other-binding" } }).ok).toBe(false);
    expect(parseAppOperation({ ...operation, binding: { ...operation.binding, definitionDigest: "missing" } }).ok).toBe(false);
    expect(parseAppOperation({ ...operation, source: "executeSomething()" }).ok).toBe(false);
    expect(parseAppOperation({ ...operation, options: { ownerUserId: "forged" } }).ok).toBe(false);
    expect(parseAppOperation({ ...operation, binding: { ...operation.binding, privateKey: "hidden" } }).ok).toBe(false);
  });

  it.each([
    { capability: "admin", bindingId: "workspace-1" },
    { capability: "secret.use", bindingId: "*" },
    { capability: "secret.use", bindingId: "model-1", value: "hidden" },
    { capability: "network.origin", origin: "https://*.example" },
    { capability: "network.origin", origin: "http://remote.example" },
    { capability: "automation.execute", bindingId: "flow-1", acts: ["everything"] },
    { capability: "automation.execute", bindingId: "flow-1", acts: ["send", "send"] }
  ])("rejects unknown, wildcard, credential-bearing and duplicated grant forms", grant => {
    expect(parseAppGrant(grant).ok).toBe(false);
  });

  it("uses exact capability/resource matching and explicit effect subsets", () => {
    const all = { capability: "automation.execute", bindingId: "flow-1", acts: ["change", "send"] } as const;
    const approved = { ...all, acts: [...all.acts] };
    expect(appGrantCovers(approved, { capability: "automation.execute", bindingId: "flow-1", acts: ["change"] })).toBe(true);
    expect(appGrantCovers(approved, { capability: "automation.execute", bindingId: "flow-1", acts: ["money"] })).toBe(false);
    expect(appGrantCovers(approved, { capability: "automation.execute", bindingId: "other", acts: [] })).toBe(false);
    expect(appGrantCovers({ capability: "dataset.read", bindingId: "dataset-1" }, { capability: "dataset.write", bindingId: "dataset-1" })).toBe(false);
    expect(appGrantCovers({ capability: "network.origin", origin: "https://app.example" }, { capability: "network.origin", origin: "https://other.example" })).toBe(false);
  });
});

describe("typed app data and invocation envelopes", () => {
  const envelope = { schemaVersion: 1, installationId: "installation-1", operationId: "list-orders", idempotencyKey: "request-1" };

  it.each([null, "scalar", 5, true, ["array"], { role: "business-role", workspace: "business-workspace", payer: "invoice-owner" }])("accepts every JSON root input shape as business data", inputs => {
    expect(parseAppInvocation({ ...envelope, inputs })).toEqual({ ok: true, value: { ...envelope, inputs } });
    expect(validateAppOperationInputs({ ...queryOperation(), inputs: {} }, inputs)).toEqual({ ok: true, value: inputs });
  });

  it("requires inputs and rejects non-JSON values and outer authority claims", () => {
    expect(parseAppInvocation(envelope).ok).toBe(false);
    for (const inputs of [undefined, Infinity, new Date(), { nested: undefined }]) expect(parseAppInvocation({ ...envelope, inputs }).ok).toBe(false);
    for (const field of ["workspaceId", "role", "payer", "target", "userId", "secretGrant", "options"]) expect(parseAppInvocation({ ...envelope, inputs: null, [field]: "forged" }).ok).toBe(false);
  });

  it("reuses existing strict JSON value validation without exposing its raw diagnostics", () => {
    const operation = executionOperation();
    expect(validateAppOperationInputs(operation, { count: 2 })).toEqual({ ok: true, value: { count: 2 } });
    for (const inputs of [{ count: 0 }, { count: 11 }, { count: 2.5 }, { count: "DO-NOT-ECHO" }, { count: 1, "DO-NOT-ECHO": true }, {}]) {
      const parsed = validateAppOperationInputs(operation, inputs);
      expect(parsed).toMatchObject({ ok: false, error: { code: "app.invalid_inputs" } });
      expect(JSON.stringify(parsed)).not.toContain("DO-NOT-ECHO");
    }
    expect(validateAppOperationResult(operation, "done")).toEqual({ ok: true, value: "done" });
    expect(validateAppOperationResult(operation, "")).toMatchObject({ ok: false, error: { code: "app.invalid_result" } });
    expect(validateAppOperationResult(operation, {})).toMatchObject({ ok: false, error: { code: "app.invalid_result" } });
  });

  it.each([
    { type: "string", format: "secret" },
    { type: "string", format: "secret", default: "DO-NOT-ECHO" },
    { type: "string", format: "secret", examples: ["DO-NOT-ECHO"] },
    { type: "string", format: "secret", enum: ["DO-NOT-ECHO"] },
    { type: "string", format: "secret", const: "DO-NOT-ECHO" },
    { type: "object", properties: { password: { type: "string", format: "secret" } } },
    { type: "array", items: { type: "string", format: "secret" } },
    { anyOf: [{ type: "string", format: "secret" }, { type: "null" }] },
    { oneOf: [{ type: "string", format: "secret" }, { type: "null" }] },
    { type: "object", additionalProperties: { type: "string", format: "secret" } }
  ])("forbids secret transport declarations on both inputs and results", schema => {
    for (const field of ["inputs", "result"]) {
      const parsed = parseAppOperation({ ...executionOperation(), [field]: schema });
      expect(parsed).toMatchObject({ ok: false, error: { code: "app.invalid_operation" } });
      expect(JSON.stringify(parsed)).not.toContain("DO-NOT-ECHO");
    }
  });

  it("returns safe errors for throwing getters and cyclic data", () => {
    const hostile = { get count() { throw new Error("DO-NOT-ECHO"); } };
    expect(validateAppOperationInputs(executionOperation(), hostile)).toMatchObject({ ok: false, error: { code: "app.invalid_inputs" } });
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(parseAppInvocation({ ...envelope, inputs: cycle }).ok).toBe(false);
  });
});

describe("operation resolution metadata", () => {
  it("has no accepted receipt, run id or execution status", () => {
    const resolution = resolutionFixture();
    expect(parseAppOperationResolution(resolution)).toEqual({ ok: true, value: resolution });
    for (const field of ["runId", "accepted", "status", "bearer", "authority"]) expect(parseAppOperationResolution({ ...resolution, [field]: "forged" }).ok).toBe(false);
    expect(parseAppOperationResolution({ ...resolution, requiredGrants: [] }).ok).toBe(false);
    expect(parseAppOperationResolution({ ...resolution, operationKind: "query" }).ok).toBe(false);
  });

  it("requires an explicit paid account for managed execution but not dataset query metadata", () => {
    const resolution = resolutionFixture();
    const target = { kind: "managed-cloud", environment: "cloud", targetId: "cloud-1" };
    expect(parseAppOperationResolution({ ...resolution, target }).ok).toBe(false);
    expect(parseAppOperationResolution({ ...resolution, target, payer: { kind: "workspace", accountId: "account-1" } }).ok).toBe(true);
    const query = queryOperation();
    expect(parseAppOperationResolution({ ...resolution, target, operationKind: "query", operationId: query.id, binding: query.binding, requiredGrants: query.requestedGrants }).ok).toBe(true);
  });
});
