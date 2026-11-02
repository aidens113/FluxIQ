import { expect, it } from "vitest";
import type { AutomationStudioInstructionReading } from "../../../../../flows/executable/permissions/index.ts";
import { createActionInstructionAuthority } from "../index.ts";

it("shares one synchronous start across concurrent derive/route calls and preserves the original reader receiver", async () => {
  let complete!: (reading: AutomationStudioInstructionReading) => void, calls = 0;
  const pending = new Promise<AutomationStudioInstructionReading>(resolve => { complete = resolve; });
  const reader = { read() { expect(this).toBe(reader);
  calls++;
  return pending; } };
  const authority = createActionInstructionAuthority(reader);
  expect(authority.route.peek()).toEqual({ state: "unread" });
  expect(calls).toBe(0);
  const derive = authority.derive(), route = authority.route.read();
  expect(calls).toBe(1);
  expect(authority.route.peek()).toEqual({ state: "unread" });
  const answer: AutomationStudioInstructionReading = { instructed: [], route: { state: "open", instructionSetDigest: "actual.digest" } };
  complete(answer);
  expect(await derive).toBe(answer.instructed);
  expect(await route).toBe(answer.route);
  expect(authority.route.peek()).toBe(answer.route);
  await authority.derive();
  expect(calls).toBe(1);
});

it.each(["reject", "throw"] as const)("retains the original %s forever without retry or open-route fallback", async kind => {
  let calls = 0;
  const failure = new Error("actual transport failed");
  const authority = createActionInstructionAuthority({ read() { calls++;
  if (kind === "throw") throw failure;
  return Promise.reject(failure); } });
  await expect(authority.derive()).rejects.toBe(failure);
  expect(await authority.route.read()).toEqual({ state: "unavailable", reason: "transport" });
  await expect(authority.derive()).rejects.toBe(failure);
  expect(authority.route.peek()).toEqual({ state: "unavailable", reason: "transport" });
  expect(calls).toBe(1);
});

it("reserves its read before a reader reenters through the route accessor", async () => {
  let calls = 0, nested: Promise<unknown> | undefined;
  const answer: AutomationStudioInstructionReading = { instructed: [], route: { state: "unavailable", reason: "non_complete" } };
  const authority = createActionInstructionAuthority({ read() { calls++;
  nested = authority.route.read();
  return Promise.resolve(answer); } });
  expect(await authority.derive()).toBe(answer.instructed);
  expect(await nested).toBe(answer.route);
  expect(calls).toBe(1);
});
