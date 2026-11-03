import type { ChatActivityState } from "@fluxiq/ui-components";
import { describe, expect, it } from "vitest";
import { createProgramActivityPort, type ActivityTimers } from "../activity";
import { fakeProgramApi } from "./fake-program-api";

/** Timers the test moves: nothing runs until `advance`. */
function manualTimers() {
  let now = 1_000;
  let nextId = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: ActivityTimers = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      pending.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (timer) => void pending.delete(timer as number)
  };
  return {
    timers,
    pending: () => pending.size,
    advance(ms: number) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at > now) continue;
        pending.delete(id);
        entry.callback();
      }
    }
  };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};

function event(sequence: number, fields: Record<string, unknown> = {}) {
  return {
    activityId: "run:r1",
    sequence,
    subject: { kind: "run", id: "r1", projectId: "p1" },
    phase: "running",
    label: "Running your Flow",
    detail: { kind: "tool", title: `Step ${sequence}`, text: `Did step ${sequence}.`, status: "succeeded" },
    at: new Date(1_000 + sequence).toISOString(),
    ...fields
  };
}

const state = (value: unknown) => value as ChatActivityState;

describe("the activity port", () => {
  it("reads get-activity for the project and answers the state the chat draws", async () => {
    const api = fakeProgramApi({ "get-activity": { ok: true, payload: { current: event(2), recent: [event(1), event(2)] } } });
    const { timers } = manualTimers();
    const port = createProgramActivityPort(api, { projectId: () => "p1", timers });
    const result = await port.read();
    expect(api.sentTo("get-activity")).toEqual([{ projectId: "p1" }]);
    if (!result.ok) throw new Error("the read failed");
    const read = state(result.value.state);
    expect(read.overlay).toBe("hidden");
    expect(read.live).toBe(true);
    expect(read.current?.sequence).toBe(2);
    expect(read.recent.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(read.display?.headline).toBeTruthy();
    expect(read.history?.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it("holds each unit of work whole across reads, though Core's snapshot moved on", async () => {
    let snapshot: unknown = { current: event(1), recent: [event(1)] };
    const api = fakeProgramApi({ "get-activity": () => ({ ok: true, payload: snapshot }) });
    const port = createProgramActivityPort(api, { projectId: () => "p1", timers: manualTimers().timers });
    await port.read();
    snapshot = { current: event(2), recent: [event(2)] };
    const result = await port.read();
    if (!result.ok) throw new Error("the read failed");
    expect(state(result.value.state).history?.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it("answers a failed read as a failure, and a missing project as an idle chat without asking", async () => {
    const failing = fakeProgramApi({ "get-activity": { ok: false, status: 0, code: "request_failed" } });
    const port = createProgramActivityPort(failing, { projectId: () => "p1", timers: manualTimers().timers });
    expect(await port.read()).toMatchObject({ ok: false, code: "unreachable" });
    const none = fakeProgramApi();
    expect(await createProgramActivityPort(none, { projectId: () => undefined, timers: manualTimers().timers }).read()).toEqual({
      ok: true,
      value: { state: { current: null, display: null, recent: [], overlay: "hidden", live: true } }
    });
    expect(none.calls).toEqual([]);
  });

  it("polls while someone listens, tells each state, and stops when the last one leaves", async () => {
    const api = fakeProgramApi({ "get-activity": { ok: true, payload: { current: event(1, { final: true }), recent: [event(1, { final: true })] } } });
    const clock = manualTimers();
    const port = createProgramActivityPort(api, { projectId: () => "p1", timers: clock.timers });
    const first: ChatActivityState[] = [];
    const second: ChatActivityState[] = [];
    const leaveFirst = port.subscribe((next) => first.push(state(next)));
    await settle();
    expect(api.sentTo("get-activity")).toHaveLength(1);
    expect(first.at(-1)?.live).toBe(true);

    const leaveSecond = port.subscribe((next) => second.push(state(next)));
    clock.advance(1_700);
    await settle();
    expect(api.sentTo("get-activity")).toHaveLength(2);
    expect(second.length).toBeGreaterThan(0);

    leaveFirst();
    clock.advance(20_000);
    await settle();
    expect(api.sentTo("get-activity").length).toBeGreaterThan(2);

    leaveSecond();
    const reads = api.sentTo("get-activity").length;
    expect(clock.pending()).toBe(0);
    clock.advance(60_000);
    await settle();
    expect(api.sentTo("get-activity")).toHaveLength(reads);
  });

  it("keeps the last state but says the stream is not reaching the chat when a read fails", async () => {
    const api = fakeProgramApi({ "get-activity": { ok: true, payload: { current: event(1), recent: [event(1)] } } });
    const clock = manualTimers();
    const port = createProgramActivityPort(api, { projectId: () => "p1", timers: clock.timers });
    const heard: ChatActivityState[] = [];
    const leave = port.subscribe((next) => heard.push(state(next)));
    await settle();
    api.answer("get-activity", { ok: false, status: 0, code: "request_failed" });
    clock.advance(1_000);
    await settle();
    expect(heard.at(-1)).toMatchObject({ live: false, overlay: "hidden" });
    expect(heard.at(-1)?.current?.sequence).toBe(1);
    leave();
  });

  it("starts over for another project rather than showing the last one's work", async () => {
    let project = "p1";
    const api = fakeProgramApi({ "get-activity": (payload) => ({ ok: true, payload: { current: event(5, { subject: { kind: "run", id: "r9", projectId: String(payload?.projectId) } }), recent: [] } }) });
    const port = createProgramActivityPort(api, { projectId: () => project, timers: manualTimers().timers });
    await port.read();
    project = "p2";
    const result = await port.read();
    if (!result.ok) throw new Error("the read failed");
    expect(state(result.value.state).current?.subject.projectId).toBe("p2");
    expect(api.sentTo("get-activity")).toEqual([{ projectId: "p1" }, { projectId: "p2" }]);
  });
});
