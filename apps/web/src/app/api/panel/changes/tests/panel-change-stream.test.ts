import type { ClientGatewayChangeListener, ClientGatewayChangesPort } from "fluxiq/client-gateway";
import { describe, expect, it } from "vitest";
import { PanelChangeStream } from "../panel-change-stream";
import { gatewayChangeTopic, modelAccessChangeTopic, panelModelAccessSource, type PanelChangeSink, type PanelChangeTopic } from "../topics";

function port() {
  const listeners = new Set<ClientGatewayChangeListener>();
  const changes: ClientGatewayChangesPort = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => 0
  };
  const signal = () => {
    for (const listener of [...listeners]) listener({ kind: "client.connected", version: 41 });
  };
  return { changes, signal, listeners };
}

/** A caller's view that a test edits; each read counts, so a test can wait for a signal to have been looked at. */
function viewOf(initial: unknown) {
  const state = { value: initial, reads: 0 };
  const view = async () => {
    state.reads += 1;
    return state.value;
  };
  return { state, view };
}

const looked = async (state: { reads: number }, reads: number) => {
  while (state.reads < reads) await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

function manualTimers() {
  const waits = new Map<number, () => void>();
  let next = 0;
  return {
    waits,
    timers: {
      set: (fire: () => void) => {
        next += 1;
        waits.set(next, fire);
        return next;
      },
      clear: (handle: unknown) => {
        waits.delete(handle as number);
      }
    },
    fireAll: () => {
      const fires = [...waits.values()];
      waits.clear();
      for (const fire of fires) fire();
    }
  };
}

describe("PanelChangeStream with the gateway topic", () => {
  it("opens at once, then sends an event only when the caller's own view changed, numbered from 1", async () => {
    const { changes, signal } = port();
    const { state, view } = viewOf({ clients: ["mine"] });
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view)], { timers: manualTimers().timers });
    expect(await stream.next()).toEqual({ done: false, value: ": open\n\n" });
    await looked(state, 1);

    // A signal that left this caller's view as it was sends nothing.
    signal();
    await looked(state, 2);
    const pending = stream.next();
    state.value = { clients: ["mine", "added"] };
    signal();
    expect(await pending).toEqual({ done: false, value: 'event: gateway\ndata: {"version":1}\n\n' });
  });

  it("carries the stream's own sequence, never the gateway's version or the change's kind", async () => {
    const { changes, signal } = port();
    const { state, view } = viewOf(0);
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view)], { timers: manualTimers().timers });
    await stream.next();
    await looked(state, 1);
    const values: string[] = [];
    for (let count = 1; count <= 3; count += 1) {
      const pending = stream.next();
      state.value = count;
      signal();
      values.push((await pending).value as string);
    }
    expect(values).toEqual([1, 2, 3].map((version) => `event: gateway\ndata: {"version":${version}}\n\n`));
    expect(values.join("")).not.toMatch(/41|client\.connected|kind/u);
  });

  it("keeps one event for changes found while no chunk was asked for, without a gap in the sequence", async () => {
    const { changes, signal } = port();
    const { state, view } = viewOf(0);
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view)], { timers: manualTimers().timers });
    await stream.next();
    await looked(state, 1);
    state.value = 1;
    signal();
    await looked(state, 2);
    state.value = 2;
    signal();
    await looked(state, 3);
    expect((await stream.next()).value).toBe('event: gateway\ndata: {"version":1}\n\n');
    const pending = stream.next();
    state.value = 3;
    signal();
    expect((await pending).value).toBe('event: gateway\ndata: {"version":2}\n\n');
  });

  it("compares a change heard while the first view is still being read against that view", async () => {
    const { changes, signal } = port();
    let release: () => void = () => undefined;
    let value = 0;
    let reads = 0;
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, async () => {
      reads += 1;
      const seen = value;
      if (reads === 1) await new Promise<void>((resolve) => { release = resolve; });
      return seen;
    })], { timers: manualTimers().timers });
    const opening = stream.next();
    value = 1;
    signal();
    release();
    expect((await opening).value).toBe(": open\n\n");
    const pending = stream.next();
    expect((await pending).value).toBe('event: gateway\ndata: {"version":1}\n\n');
  });

  // t1095 RC4: the browser reads the snapshot once the stream opens. Opening
  // before the topic had its first view let a request made between the
  // browser's read and that view go unsignalled: it was in the baseline already.
  it("`: open` waits for each topic's baseline, and a change made meanwhile still follows it", async () => {
    const { changes, signal } = port();
    let release: () => void = () => undefined;
    let reads = 0;
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, async () => {
      reads += 1;
      if (reads === 1) await new Promise<void>((resolve) => { release = resolve; });
      return reads;
    })], { timers: manualTimers().timers });
    let opened = false;
    const opening = stream.next().then((step) => {
      opened = true;
      return step;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(opened).toBe(false);
    release();
    expect((await opening).value).toBe(": open\n\n");
    // After the opening, any change to the view is signalled.
    signal();
    expect((await stream.next()).value).toBe('event: gateway\ndata: {"version":1}\n\n');
  });

  it("settles an opening still waiting for a baseline when the stream is returned or a topic fails", async () => {
    const { changes } = port();
    const hung = new PanelChangeStream([gatewayChangeTopic(changes, () => new Promise<never>(() => undefined))], { timers: manualTimers().timers });
    const opening = hung.next();
    await hung.return();
    expect(await opening).toEqual({ done: true, value: undefined });

    const failing = manualTopic();
    const waiting = manualTopic();
    const failed = new PanelChangeStream([waiting.start, failing.start], { timers: manualTimers().timers });
    waiting.topic.sink!.opensAfter(new Promise<void>(() => undefined));
    const failedOpening = failed.next();
    failing.topic.sink!.fail(new Error("authority lost"));
    await expect(failedOpening).rejects.toThrow("authority lost");
  });

  it("sends no change before the opening while a baseline is read", async () => {
    const threads = manualTopic();
    let baselined: () => void = () => undefined;
    const stream = new PanelChangeStream([threads.start], { timers: manualTimers().timers });
    threads.topic.sink!.opensAfter(new Promise<void>((resolve) => { baselined = resolve; }));
    const opening = stream.next();
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.one" });
    baselined();
    expect((await opening).value).toBe(": open\n\n");
    expect((await stream.next()).value).toBe('event: conversation\ndata: {"conversationId":"conversation.one","version":1}\n\n');
  });

  it("sends a keep-alive comment when nothing changed for the keep-alive time", async () => {
    const { changes } = port();
    const { state, view } = viewOf(0);
    const clock = manualTimers();
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view)], { timers: clock.timers, keepAliveMs: 10 });
    await stream.next();
    await looked(state, 1);
    const pending = stream.next();
    expect(clock.waits.size).toBe(1);
    clock.fireAll();
    expect(await pending).toEqual({ done: false, value: ": keep-alive\n\n" });
  });

  it("fails the stream when the caller's view can no longer be read", async () => {
    const { changes, signal, listeners } = port();
    let refuse = false;
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, async () => {
      if (refuse) throw new Error("authority lost");
      return 0;
    })], { timers: manualTimers().timers });
    await stream.next();
    const pending = stream.next();
    await new Promise<void>((resolve) => setImmediate(resolve));
    refuse = true;
    signal();
    await expect(pending).rejects.toThrow("authority lost");
    expect(listeners.size).toBe(0);
  });

  it("ends a chunk still being waited for, unsubscribes and stops its wait as soon as it is returned", async () => {
    const { changes, listeners, signal } = port();
    const { state, view } = viewOf(0);
    const clock = manualTimers();
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view)], { timers: clock.timers });
    await stream.next();
    await looked(state, 1);
    const pending = stream.next();
    await stream.return();
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(listeners.size).toBe(0);
    expect(clock.waits.size).toBe(0);
    state.value = 9;
    signal();
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  });
});

/** A topic a test drives by hand: `sink` is set once the stream starts it, `stopped` once the stream stops it. */
function manualTopic() {
  const topic = { sink: undefined as PanelChangeSink | undefined, stopped: false };
  const start: PanelChangeTopic = {
    start(sink) {
      topic.sink = sink;
      return () => {
        topic.stopped = true;
      };
    }
  };
  return { topic, start };
}

describe("PanelChangeStream with several topics", () => {
  it("names the thread or the project to read again, numbers every event in one sequence, and coalesces repeats until sent", async () => {
    const threads = manualTopic();
    const activity = manualTopic();
    const stream = new PanelChangeStream([threads.start, activity.start], { timers: manualTimers().timers });
    await stream.next();
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.one" });
    activity.topic.sink!.changed({ topic: "activity", projectId: "project.a" });
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.one" });
    activity.topic.sink!.changed({ topic: "activity", projectId: "project.a" });
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.two" });
    expect((await stream.next()).value).toBe('event: conversation\ndata: {"conversationId":"conversation.one","version":1}\n\n');
    expect((await stream.next()).value).toBe('event: activity\ndata: {"projectId":"project.a","version":2}\n\n');
    expect((await stream.next()).value).toBe('event: conversation\ndata: {"conversationId":"conversation.two","version":3}\n\n');
    const pending = stream.next();
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.one" });
    expect((await pending).value).toBe('event: conversation\ndata: {"conversationId":"conversation.one","version":4}\n\n');
  });

  it("fails, and stops every topic, when one topic fails", async () => {
    const threads = manualTopic();
    const activity = manualTopic();
    const stream = new PanelChangeStream([threads.start, activity.start], { timers: manualTimers().timers });
    await stream.next();
    const pending = stream.next();
    activity.topic.sink!.fail(new Error("authority could not be decided"));
    await expect(pending).rejects.toThrow("authority could not be decided");
    expect([threads.topic.stopped, activity.topic.stopped]).toEqual([true, true]);
    threads.topic.sink!.changed({ topic: "conversation", conversationId: "conversation.one" });
    await expect(stream.next()).rejects.toThrow("authority could not be decided");
  });

  it("stops a topic that failed while starting, and starts no more", () => {
    const later = manualTopic();
    let stoppedFailing = false;
    const failing: PanelChangeTopic = {
      start(sink) {
        sink.fail(new Error("refused at once"));
        return () => {
          stoppedFailing = true;
        };
      }
    };
    void new PanelChangeStream([failing, later.start], { timers: manualTimers().timers });
    expect(stoppedFailing).toBe(true);
    expect(later.topic.sink).toBeUndefined();
  });

  it("stops every topic as soon as it is returned", async () => {
    const threads = manualTopic();
    const stream = new PanelChangeStream([threads.start], { timers: manualTimers().timers });
    await stream.next();
    await stream.return();
    expect(threads.topic.stopped).toBe(true);
  });
});

/** A model-access source a test signals, counting who listens. */
function modelAccessSource() {
  const listeners = new Set<() => void>();
  const source = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  const signal = () => {
    for (const listener of [...listeners]) listener();
  };
  return { source, signal, listeners };
}

describe("PanelChangeStream with the model-access topic", () => {
  it("sends `model-access` with the stream's version alone each time the runtime signals", async () => {
    const { source, signal } = modelAccessSource();
    const stream = new PanelChangeStream([modelAccessChangeTopic(source)], { timers: manualTimers().timers });
    await stream.next();
    const pending = stream.next();
    signal();
    expect((await pending).value).toBe('event: model-access\ndata: {"version":1}\n\n');
    const next = stream.next();
    signal();
    expect((await next).value).toBe('event: model-access\ndata: {"version":2}\n\n');
  });

  it("coalesces a burst of signals into one event until it is sent, in order with the other topics", async () => {
    const { source, signal } = modelAccessSource();
    const { changes, signal: gatewaySignal } = port();
    const { state, view } = viewOf(0);
    const stream = new PanelChangeStream([gatewayChangeTopic(changes, view), modelAccessChangeTopic(source)], { timers: manualTimers().timers });
    await stream.next();
    await looked(state, 1);
    signal();
    signal();
    state.value = 1;
    gatewaySignal();
    await looked(state, 2);
    signal();
    expect((await stream.next()).value).toBe('event: model-access\ndata: {"version":1}\n\n');
    expect((await stream.next()).value).toBe('event: gateway\ndata: {"version":2}\n\n');
    const pending = stream.next();
    signal();
    expect((await pending).value).toBe('event: model-access\ndata: {"version":3}\n\n');
  });

  it("stops listening when the stream ends", async () => {
    const { source, listeners } = modelAccessSource();
    const stream = new PanelChangeStream([modelAccessChangeTopic(source)], { timers: manualTimers().timers });
    expect(listeners.size).toBe(1);
    await stream.return();
    expect(listeners.size).toBe(0);
  });

  it("reads the program runtime's own `modelAccessChanges` and nothing else, and none when it is absent or not a source", () => {
    const { source, listeners } = modelAccessSource();
    const read = panelModelAccessSource({ modelAccessChanges: source });
    expect(read).toBeDefined();
    const stop = read!.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
    for (const runtime of [{}, { modelAccessChanges: null }, { modelAccessChanges: {} }, { modelAccessChanges: { subscribe: "no" } }]) expect(panelModelAccessSource(runtime)).toBeUndefined();
  });
});
