import { expect, it } from "vitest";
import { planEnvironmentIntent } from "../index.ts";
import type { EnvironmentIntent, EnvironmentRecord } from "../index.ts";

function intent(kind: EnvironmentIntent["kind"], operationId: string, overrides: Partial<EnvironmentIntent> = {}): EnvironmentIntent {
  return { operationId, environmentId: "env-a", kind, accountId: "account-a", workspaceId: "workspace-a", driver: "fake", ...overrides };
}

function record(overrides: Partial<EnvironmentRecord> = {}): EnvironmentRecord {
  return { environmentId: "env-a", accountId: "account-a", workspaceId: "workspace-a", driver: "fake", desired: "running", observed: "running", operationId: "op-1", ...overrides };
}

it("creates a record desiring running, observed absent, under the operation id", () => {
  expect(planEnvironmentIntent(null, null, intent("create", "op-1"))).toEqual({
    replayed: false,
    record: record({ observed: "absent" }),
    operation: { operationId: "op-1", environmentId: "env-a", kind: "create", accountId: "account-a", workspaceId: "workspace-a" }
  });
});

it("replays the same operation and refuses any other use of its id", () => {
  const existing = record({ operationId: "op-2", desired: "stopped" });
  const previous = { operationId: "op-1", environmentId: "env-a", kind: "create" as const, accountId: "account-a", workspaceId: "workspace-a" };
  expect(planEnvironmentIntent(existing, previous, intent("create", "op-1"))).toEqual({ replayed: true, record: existing });
  expect(() => planEnvironmentIntent(existing, previous, intent("stop", "op-1"))).toThrow(expect.objectContaining({ code: "operation-reused" }));
  expect(() => planEnvironmentIntent(existing, previous, intent("create", "op-1", { workspaceId: "workspace-b" }))).toThrow(expect.objectContaining({ code: "operation-reused" }));
});

it("moves desired state through stop, start and delete, keeping the observation", () => {
  expect(planEnvironmentIntent(record(), null, intent("stop", "op-2")).record).toMatchObject({ desired: "stopped", observed: "running", operationId: "op-2" });
  expect(planEnvironmentIntent(record({ desired: "stopped" }), null, intent("start", "op-2")).record).toMatchObject({ desired: "running" });
  expect(planEnvironmentIntent(record(), null, intent("delete", "op-2")).record).toMatchObject({ desired: "deleted", observed: "running" });
});

it("refuses what the state machine does not allow", () => {
  const code = (fn: () => unknown): unknown => {
    try {
      fn();
    } catch (error) {
      return (error as { code?: unknown }).code;
    }
    return null;
  };
  expect(code(() => planEnvironmentIntent(record(), null, intent("create", "op-2")))).toBe("environment-exists");
  expect(code(() => planEnvironmentIntent(null, null, intent("start", "op-2")))).toBe("not-found");
  expect(code(() => planEnvironmentIntent(null, null, intent("delete", "op-2")))).toBe("not-found");
  expect(code(() => planEnvironmentIntent(record({ desired: "deleted" }), null, intent("start", "op-2")))).toBe("environment-deleted");
  expect(code(() => planEnvironmentIntent(record({ desired: "deleted" }), null, intent("create", "op-2")))).toBe("environment-exists");
  expect(code(() => planEnvironmentIntent(record(), null, intent("stop", "op-2", { accountId: "account-b" })))).toBe("owned-elsewhere");
  expect(code(() => planEnvironmentIntent(record(), null, intent("stop", "op-2", { driver: "docker" })))).toBe("driver-mismatch");
});

it("creates a fully deleted environment again, on any driver, as new", () => {
  const gone = record({ desired: "deleted", observed: "deleted", driver: "docker" });
  expect(planEnvironmentIntent(gone, null, intent("create", "op-2")).record).toEqual(record({ observed: "absent", operationId: "op-2" }));
  expect(planEnvironmentIntent(gone, null, intent("delete", "op-2")).record).toMatchObject({ driver: "docker", observed: "deleted" });
});
