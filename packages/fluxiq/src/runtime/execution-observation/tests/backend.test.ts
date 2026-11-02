import { expect, it } from "vitest";
import { ExecutionBackendAttempts, ExecutionRetrySeriesOwner, type ExecutionRetrySeries } from "../index.ts";
import { observationFixture } from "./fixture.ts";

it("authenticates private series identity and scope, and never fences another authored invocation", async () => {
  const f = await observationFixture();
  const other = await observationFixture();
  const owner = new ExecutionRetrySeriesOwner(f.scope);
  const backend = new ExecutionBackendAttempts(f.scope, f.source);
  const firstInvocation = Object.freeze({});
  const first = owner.forInvocation(firstInvocation);
  expect(owner.forInvocation(firstInvocation)).toBe(first);
  expect(owner.forEffect(first, 0)).toBe(owner.forEffect(first, 0));
  expect(owner.forEffect(first, 0)).not.toBe(owner.forEffect(first, 1));
  expect(() => backend.begin({ ...first } as ExecutionRetrySeries)).toThrow("foreign_retry_series");
  expect(() => backend.begin(new ExecutionRetrySeriesOwner(other.scope).forInvocation({}))).toThrow("foreign_retry_series");
  backend.begin(first);
  expect(() => backend.begin(first)).toThrow("unverified_backend_retry");
  expect(() => backend.begin(owner.forInvocation({}))).not.toThrow();
});
