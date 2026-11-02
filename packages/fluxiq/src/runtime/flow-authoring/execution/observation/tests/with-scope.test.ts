import { expect, it } from "vitest";
import { observationFixture } from "../../../../execution-observation/tests/fixture.ts";
import { AuthoringExecutionScope, withAuthoringExecutionScope } from "../index.ts";

it("refuses an original closed scope before binding or invoking the body", async () => {
  const f = await observationFixture();
  const invocation = {};
  const target = {};
  const scope = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined });
  scope.close();
  let called = 0;
  await expect(withAuthoringExecutionScope(scope, [target], async () => { called += 1; })).rejects.toThrow("scope_not_current");
  expect(called).toBe(0);
  expect(AuthoringExecutionScope.of(invocation)).toBeUndefined();
  expect(AuthoringExecutionScope.of(target)).toBeUndefined();
});

it("refuses a shadowed original scope and retains the actual original restoration order", async () => {
  const f = await observationFixture();
  const invocation = {};
  const target = {};
  const options = {};
  const scope = new AuthoringExecutionScope(invocation, { parent: f.parent, callbacks: f.source, automation: undefined }, options);
  const shadow = new AuthoringExecutionScope(invocation, scope.context, options, scope);
  let called = 0;
  await expect(withAuthoringExecutionScope(scope, [target], async () => { called += 1; })).rejects.toThrow("scope_not_current");
  expect(called).toBe(0);
  expect(AuthoringExecutionScope.of(invocation)).toBe(shadow);
  expect(AuthoringExecutionScope.of(target)).toBeUndefined();
  shadow.close();
  await withAuthoringExecutionScope(scope, [target], async () => {
    called += 1;
    expect(AuthoringExecutionScope.of(target)?.context).toBe(scope.context);
    expect(AuthoringExecutionScope.of(target)?.options).toBe(options);
  });
  expect(called).toBe(1);
  expect(AuthoringExecutionScope.of(invocation)).toBe(scope);
  expect(AuthoringExecutionScope.of(target)).toBeUndefined();
  scope.close();
});

it("preserves the truly unobserved path without creating a scope", async () => {
  const target = {};
  let called = 0;
  await expect(withAuthoringExecutionScope(undefined, [target], async () => {
    called += 1;
    return "original value";
  })).resolves.toBe("original value");
  expect(called).toBe(1);
  expect(AuthoringExecutionScope.of(target)).toBeUndefined();
});
