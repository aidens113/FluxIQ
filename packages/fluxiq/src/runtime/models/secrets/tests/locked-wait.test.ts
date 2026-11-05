import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON, AutomationStudioPersonWaitClock, automationStudioSessionKeyLocked, releaseAutomationStudioSessionProviderKey, waitWhileAutomationStudioSessionKeyLocked, type AutomationStudioSessionKeyPorts } from "../index.ts";
import { automationStudioLlmProviderCall } from "../../retry/index.ts";
import type { ModelProvider, ModelRequest } from "../../contracts/index.ts";

const USER = "user.one";
const KEY = { id: "secret:one", kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1, createdBy: USER };

/** Ports over a fake holder: the key is released while `held` is true, and `unlock()` wakes the waiters as Secret Keys does. */
function fakePorts() {
  let held = false;
  let wake: Array<() => void> = [];
  const reveals: string[] = [];
  const ports: AutomationStudioSessionKeyPorts = {
    snapshot: async () => ({ keys: [KEY] }),
    createSessionRevealAuthorization: async ({ id }) => {
      if (!held) throw new Error("Secret key session unlock is unavailable");
      return { authorizationId: "auth", keyId: id, keyUpdatedAtMs: KEY.updatedAtMs };
    },
    revealKeyWithAuthorization: async () => {
      reveals.push("revealed");
      return { value: "dummy-value" };
    },
    revokeRevealAuthorization: () => undefined,
    sessionHoldsKey: async () => held,
    whenUnlockChanges: (_userId, signal) => new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      wake.push(resolve);
      signal?.addEventListener("abort", () => resolve(), { once: true });
    })
  };
  return {
    ports,
    reveals,
    unlock() {
      held = true;
      this.nudge();
    },
    nudge() {
      for (const settle of wake) settle();
      wake = [];
    }
  };
}

const caller = { userId: USER, sessionId: "paired-client:browser" };
const options = { provider: "deepseek" as const };

describe("a locked key waits for the person", () => {
  it("waits with a reason the contract knows, then carries on when they unlock", async () => {
    const fake = fakePorts();
    const events: string[] = [];
    let done = false;
    const waiting = waitWhileAutomationStudioSessionKeyLocked(fake.ports, caller, { ...options, onWait: (event) => { events.push(`${event.phase}:${event.status}:${event.waitingFor}`); } }).then(() => { done = true; });
    await vi.waitFor(() => expect(events).toEqual([`waiting:waiting_for_person:${AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON}`]));
    expect(done).toBe(false);
    // A change that does not open this key does not end the wait.
    fake.nudge();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(done).toBe(false);
    fake.unlock();
    await waiting;
    expect(events.at(-1)).toBe(`resumed:waiting_for_person:${AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON}`);
    await expect(releaseAutomationStudioSessionProviderKey(fake.ports, caller, options)).resolves.toBe("dummy-value");
    expect(AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS).toContain(AUTOMATION_STUDIO_LOCKED_KEY_WAIT_REASON);
  });

  it("does not wait when nothing is locked, and says nothing", async () => {
    const fake = fakePorts();
    fake.unlock();
    const onWait = vi.fn();
    await waitWhileAutomationStudioSessionKeyLocked(fake.ports, caller, { ...options, onWait });
    expect(onWait).not.toHaveBeenCalled();
  });

  it("ends when the person presses Stop, with no resume", async () => {
    const fake = fakePorts();
    const controller = new AbortController();
    const events: string[] = [];
    const waiting = waitWhileAutomationStudioSessionKeyLocked(fake.ports, caller, { ...options, signal: controller.signal, onWait: (event) => { events.push(event.phase); } });
    await vi.waitFor(() => expect(events).toEqual(["waiting"]));
    controller.abort();
    await waiting;
    expect(events).toEqual(["waiting"]);
  });

  it("is not a lock when the person has no key or may not use it: the release says that in its own words", async () => {
    const fake = fakePorts();
    await expect(automationStudioSessionKeyLocked({ ...fake.ports, snapshot: async () => ({ keys: [] }) }, caller, options)).resolves.toBe(false);
    await expect(automationStudioSessionKeyLocked({ ...fake.ports, authorizeUseKey: async () => false }, caller, options)).resolves.toBe(false);
    await expect(automationStudioSessionKeyLocked(fake.ports, caller, { ...options, flowKeyId: "secret:missing" })).resolves.toBe(false);
  });

  it("a host's trouble saying so never stops the work", async () => {
    const fake = fakePorts();
    const waiting = waitWhileAutomationStudioSessionKeyLocked(fake.ports, caller, { ...options, onWait: () => { throw new Error("thread is gone"); } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    fake.unlock();
    await expect(waiting).resolves.toBeUndefined();
  });
});

describe("the clock a limit on a Flow's work should read", () => {
  const flow = { projectId: "project.one", flowId: "flow.one" };

  it("stands still while that Flow waits for a person, and only that Flow", () => {
    let now = 1_000;
    const clock = new AutomationStudioPersonWaitClock(() => now);
    const work = clock.clock(flow);
    const other = clock.clock({ projectId: "project.one", flowId: "flow.other" });
    expect(work()).toBe(1_000);
    const end = clock.begin(flow);
    now = 9_000_000;
    expect(work()).toBe(1_000);
    expect(other()).toBe(9_000_000);
    end();
    now = 9_000_500;
    expect(work()).toBe(1_500);
    expect(clock.heldMs(flow)).toBe(8_999_000);
  });

  it("counts overlapping waits on one Flow once, and a second end does nothing", () => {
    let now = 0;
    const clock = new AutomationStudioPersonWaitClock(() => now);
    const first = clock.begin(flow);
    now = 100;
    const second = clock.begin(flow);
    now = 200;
    first();
    first();
    now = 300;
    second();
    now = 400;
    expect(clock.heldMs(flow)).toBe(300);
  });
});

describe("the seam every provider call passes through", () => {
  const request = { timeoutMs: 5, requestId: "request", idempotencyKey: "key" } as unknown as ModelRequest;

  it("waits before an attempt starts its deadline, so a long wait is no timeout and spends no attempt", async () => {
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const runTask = vi.fn(async () => "answer");
    const provider = { metadata: { provider: "fake", model: "fake" }, runTask, whenReady: () => ready } as unknown as ModelProvider;
    const call = automationStudioLlmProviderCall({ provider, request, now: Date.now });
    // Many times the attempt's own 5 ms deadline.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(runTask).not.toHaveBeenCalled();
    release();
    await expect(call).resolves.toMatchObject({ ok: true, result: "answer" });
    expect(runTask).toHaveBeenCalledTimes(1);
  });

  it("reports a Stop during the wait as the cancellation it is, having sent nothing", async () => {
    const controller = new AbortController();
    const runTask = vi.fn(async () => "answer");
    const provider = { metadata: { provider: "fake", model: "fake" }, runTask, whenReady: (_request: unknown, execution?: { signal?: AbortSignal }) => new Promise<void>((resolve) => execution?.signal?.addEventListener("abort", () => resolve(), { once: true })) } as unknown as ModelProvider;
    const call = automationStudioLlmProviderCall({ provider, request, now: Date.now, signal: controller.signal });
    controller.abort();
    const outcome = await call;
    expect(outcome.ok).toBe(false);
    expect(runTask).not.toHaveBeenCalled();
  });
});
