import { expect, it } from "vitest";
import { observationFixture } from "../../../../execution-observation/tests/fixture.ts";
import { AuthoringExecutionScope, type AuthoringExecutionContext, type AuthoringExecutionToolPort } from "../index.ts";

it("retains every original context reference and restores a nested invocation without replacing its parent", async () => {
  const f = await observationFixture();
  const invocation = Object.freeze({}), options = Object.freeze({}), request = Object.freeze({});
  const observer: AuthoringExecutionToolPort = {
    async prepareParent() { throw new Error("this identity subject does not prepare a tool"); },
    bindParent() { throw new Error("this identity subject does not bind a tool"); },
    async invoke() { throw new Error("this identity subject does not invoke a tool"); }
  };
  const prepareToolParent = observer.prepareParent.bind(observer);
  const context: AuthoringExecutionContext = { parent: f.parent, callbacks: f.source, automation: undefined, originalRoot: f.reserved.root, toolObserver: observer, toolRequest: request, prepareToolParent };
  const parent = new AuthoringExecutionScope(invocation, context, options);
  expect(parent.context).toBe(context);
  expect(parent.options).toBe(options);
  expect(Object.keys(parent.context)).toEqual(["parent", "callbacks", "automation", "originalRoot", "toolObserver", "toolRequest", "prepareToolParent"]);
  const childContext = { ...context };
  const child = new AuthoringExecutionScope(invocation, childContext, request, parent);
  expect(AuthoringExecutionScope.of(invocation)).toBe(child);
  expect(child.context.originalRoot).toBe(f.reserved.root);
  expect(child.context.toolObserver).toBe(observer);
  expect(child.context.prepareToolParent).toBe(prepareToolParent);
  expect(() => parent.close()).toThrow("site_reset.observation_changed");
  child.close();
  expect(AuthoringExecutionScope.of(invocation)).toBe(parent);
  expect(parent.context.parent).toBe(f.parent);
  parent.close();
  expect(AuthoringExecutionScope.of(invocation)).toBeUndefined();
});

it("rejects a changed owner or ownership cycle while preserving exact receiver and argument identities", () => {
  const receiver = Object.freeze({}), returnedPort = Object.freeze({}), argument = Object.freeze({});
  AuthoringExecutionScope.own(returnedPort, receiver);
  expect(AuthoringExecutionScope.targets(returnedPort, argument)).toEqual([argument, returnedPort, receiver]);
  expect(() => AuthoringExecutionScope.own(returnedPort, {})).toThrow("site_reset.owner_changed");
  expect(() => AuthoringExecutionScope.own(receiver, returnedPort)).toThrow("site_reset.owner_cycle");
});
