import { describe, expect, it, vi } from "vitest";
import type { ClientGatewayTraceStore } from "../../../../../client-gateway/index.ts";
import { ClientGatewayTraceMemoryStore } from "../../../../../client-gateway/index.ts";
import type { AutomationStudioGatewayTraceOpenEpisode } from "../index.ts";
import { episode, gatewayEvent, newEpisodes, storedEvents } from "./episode-builders.ts";

describe("AutomationStudioGatewayTraceEpisodes: open, close, termination", () => {
  it("opens a live trace with the episode's identity, records the gateway's events in the frame, and closes it completed", async () => {
    const { episodes, stores } = newEpisodes();
    const answer = await episodes.run(episode({ episodeId: "run-7", flowId: "flow-1" }), async () => {
      const sink = episodes.gatewaySource?.current();
      expect(sink).toBeDefined();
      expect(episodes.current()?.episodeId).toBe("run-7");
      sink?.record(gatewayEvent({ encoding: "text", text: '{"type":"client.state_update"}' }));
      return "done";
    });
    expect(answer).toBe("done");
    const store = stores.get("project-1");
    const manifest = await store?.readManifest("trace-1");
    expect(manifest?.episodeId).toBe("run-7");
    expect(manifest?.activity).toBe("execution");
    expect(manifest?.origin).toEqual({ kind: "live" });
    expect(manifest?.context).toEqual({ schema: { name: "automation-studio.run-context", version: "1" }, value: { flowId: "flow-1" } });
    expect(manifest?.contractVersions).toEqual({ "client-gateway": "1" });
    expect(manifest?.streams).toEqual(["gateway", "control"]);
    expect(manifest?.terminationReason).toBe("completed");
    expect(manifest?.completeness.status).toBe("complete");
    expect((await storedEvents(store, "trace-1")).map((event) => event.messageType)).toEqual(["client.state_update"]);
    expect(episodes.gatewaySource?.current()).toBeUndefined();
    expect(episodes.registry.size()).toBe(0);
  });

  it("closes failed when the work throws, rethrowing the work's own error", async () => {
    const { episodes, stores } = newEpisodes();
    const failure = new Error("the step could not finish");
    await expect(episodes.run(episode(), async () => {
      throw failure;
    })).rejects.toBe(failure);
    const manifest = await stores.get("project-1")?.readManifest("trace-1");
    expect(manifest?.terminationReason).toBe("failed");
    expect(manifest?.terminationDetail).toBe("Error: the step could not finish");
  });

  it("closes cancelled on an AbortError, and keeps a secret-shaped message out of the detail", async () => {
    const { episodes, stores } = newEpisodes();
    await expect(episodes.run(episode(), async () => {
      throw new DOMException("The build was cancelled.", "AbortError");
    })).rejects.toThrow("cancelled");
    await expect(episodes.run(episode({ episodeId: "run-2" }), async () => {
      throw new Error("refused key sk-abcdefghij0123456789xyz");
    })).rejects.toThrow();
    const store = stores.get("project-1");
    expect((await store?.readManifest("trace-1"))?.terminationReason).toBe("cancelled");
    const failed = await store?.readManifest("trace-2");
    expect(failed?.terminationReason).toBe("failed");
    expect(failed?.terminationDetail).toBe("Error");
  });

  it("chooses the store by project when each episode opens", async () => {
    const { episodes, storeRequests, stores } = newEpisodes();
    await episodes.run(episode({ projectId: "project-a" }), async () => undefined);
    await episodes.run(episode({ projectId: "project-b", episodeId: "run-2" }), async () => undefined);
    expect(storeRequests).toEqual(["project-a", "project-b"]);
    expect((await stores.get("project-a")?.readManifest("trace-1"))?.episodeId).toBe("run-1");
    expect((await stores.get("project-b")?.readManifest("trace-2"))?.episodeId).toBe("run-2");
  });

  it("reports a trace that cannot open or close, and the work runs and answers regardless", async () => {
    const refusing = newEpisodes({ storeFor: () => { throw new Error("no project pool"); } });
    expect(await refusing.episodes.run(episode(), async () => refusing.episodes.gatewaySource?.current())).toBeUndefined();
    expect(refusing.failures.map((failure) => failure.stage)).toEqual(["open"]);
    const broken = new ClientGatewayTraceMemoryStore();
    const failingStore: ClientGatewayTraceStore = Object.assign(Object.create(broken) as ClientGatewayTraceStore, {
      writeManifest: async () => {
        throw new Error("disk full");
      }
    });
    const closing = newEpisodes({ storeFor: () => failingStore });
    expect(await closing.episodes.run(episode(), async () => "answered")).toBe("answered");
    expect(closing.failures.map((failure) => failure.stage)).toEqual(["close"]);
    expect(closing.episodes.registry.size()).toBe(0);
  });
});

describe("AutomationStudioGatewayTraceEpisodes: flush policy", () => {
  it("flushes every N recorded events, not before", async () => {
    const { episodes, stores } = newEpisodes({ flush: { everyEvents: 3, intervalMs: 60_000 } });
    await episodes.run(episode(), async () => {
      const sink = episodes.gatewaySource?.current();
      sink?.record(gatewayEvent({ encoding: "text", text: "{}" }));
      sink?.record(gatewayEvent({ encoding: "text", text: "{}" }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await storedEvents(stores.get("project-1"), "trace-1")).toHaveLength(0);
      sink?.record(gatewayEvent({ encoding: "text", text: "{}" }));
      await vi.waitFor(async () => expect(await storedEvents(stores.get("project-1"), "trace-1")).toHaveLength(3));
      sink?.record(gatewayEvent({ encoding: "text", text: "{}" }));
      expect(sink?.status().bufferedEvents).toBe(1);
    });
    expect(await storedEvents(stores.get("project-1"), "trace-1")).toHaveLength(4);
  });

  it("flushes buffered events on its interval, and the timer never holds the process", async () => {
    const unref = vi.fn();
    const realSetInterval = globalThis.setInterval;
    const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((handler: () => void, ms: number) => {
      const timer = realSetInterval(handler, ms);
      const original = timer.unref.bind(timer);
      timer.unref = () => {
        unref();
        return original();
      };
      return timer;
    }) as typeof setInterval);
    try {
      const { episodes, stores } = newEpisodes({ flush: { everyEvents: 1000, intervalMs: 10 } });
      await episodes.run(episode(), async () => {
        episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: "{}" }));
        await vi.waitFor(async () => expect(await storedEvents(stores.get("project-1"), "trace-1")).toHaveLength(1));
      });
      expect(unref).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a flush policy that is not positive", () => {
    const { episodes, failures } = newEpisodes({ flush: { everyEvents: 0, intervalMs: 10 } });
    return episodes.run(episode(), async () => {
      expect(episodes.gatewaySource?.current()).toBeUndefined();
      expect(failures.map((failure) => String(failure.error))).toEqual(["Error: gateway_trace.flush_every_events must be a positive integer"]);
    });
  });
});

describe("AutomationStudioGatewayTraceEpisodes: nesting and concurrency", () => {
  it("a nested episode takes the frame for its own work; the parent records markers naming the child's trace", async () => {
    const { episodes, stores } = newEpisodes();
    await episodes.run(episode({ episodeId: "build.1", activity: "exploration", flowId: "flow-1" }), async () => {
      episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"n":"before"}' }));
      await episodes.run(episode({ episodeId: "trial-1", activity: "test", flowId: "flow-1" }), async () => {
        expect(episodes.current()?.episodeId).toBe("trial-1");
        episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"n":"inside"}' }));
      });
      expect(episodes.current()?.episodeId).toBe("build.1");
      episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"n":"after"}' }));
    });
    const store = stores.get("project-1");
    const parent = await storedEvents(store, "trace-1");
    expect(parent.map((event) => [event.kind, event.messageType])).toEqual([
      ["inbound", "client.state_update"],
      ["control", "control.child_episode_opened"],
      ["control", "control.child_episode_closed"],
      ["inbound", "client.state_update"]
    ]);
    expect(parent[1]?.payload).toEqual({ encoding: "json", value: { traceId: "trace-2", episodeId: "trial-1", activity: "test" } });
    expect(parent[2]?.payload).toEqual({ encoding: "json", value: { traceId: "trace-2", episodeId: "trial-1", terminationReason: "completed" } });
    expect(parent[1]?.stream).toBe("control");
    const child = await storedEvents(store, "trace-2");
    expect(child.map((event) => event.payload)).toEqual([{ encoding: "text", text: '{"n":"inside"}' }]);
    expect((await store?.readManifest("trace-2"))?.activity).toBe("test");
  });

  it("two episodes running at once each record only their own work", async () => {
    const { episodes, stores } = newEpisodes();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const one = episodes.run(episode({ episodeId: "run-a" }), async () => {
      await gate;
      episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"from":"a"}' }));
    });
    const two = episodes.run(episode({ episodeId: "run-b" }), async () => {
      episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"from":"b"}' }));
      release();
      await gate;
      episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: '{"from":"b2"}' }));
    });
    await Promise.all([one, two]);
    const store = stores.get("project-1");
    expect((await storedEvents(store, "trace-1")).map((event) => event.payload)).toEqual([{ encoding: "text", text: '{"from":"a"}' }]);
    expect((await storedEvents(store, "trace-2")).map((event) => event.payload)).toEqual([
      { encoding: "text", text: '{"from":"b"}' },
      { encoding: "text", text: '{"from":"b2"}' }
    ]);
    expect((await store?.readManifest("trace-1"))?.episodeId).toBe("run-a");
    expect((await store?.readManifest("trace-2"))?.episodeId).toBe("run-b");
  });
});

describe("AutomationStudioGatewayTraceEpisodes: registry and control events", () => {
  it("finds open episodes by run id and by project and Flow, outermost first, and forgets them at close", async () => {
    const { episodes } = newEpisodes();
    let seen: { byRun: string | undefined; byFlow: string[]; other: number } | undefined;
    await episodes.run(episode({ episodeId: "build.1", activity: "exploration", flowId: "flow-1" }), async () => {
      await episodes.run(episode({ episodeId: "trial-1", activity: "test", flowId: "flow-1" }), async () => {
        seen = {
          byRun: episodes.registry.byRunId("trial-1")?.traceId,
          byFlow: episodes.registry.byFlow("project-1", "flow-1").map((open) => open.episodeId),
          other: episodes.registry.byFlow("project-2", "flow-1").length
        };
      });
    });
    expect(seen).toEqual({ byRun: "trace-2", byFlow: ["build.1", "trial-1"], other: 0 });
    expect(episodes.registry.byRunId("trial-1")).toBeUndefined();
    expect(episodes.registry.byFlow("project-1", "flow-1")).toEqual([]);
  });

  it("records control events into a given episode from outside its context, and into the ambient one otherwise", async () => {
    const { episodes, stores } = newEpisodes();
    let held: AutomationStudioGatewayTraceOpenEpisode | undefined;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = episodes.run(episode({ episodeId: "run-9" }), async () => {
      episodes.recordControl({ type: "ask_answer", payload: { askId: "ask-1", answer: "yes" } });
      await gate;
    });
    held = episodes.registry.byRunId("run-9");
    expect(episodes.recordControl({ type: "append_turn", payload: { text: "outside every episode" } })).toBeUndefined();
    const result = episodes.recordControl({ type: "run_control", payload: { action: "pause", runId: "run-9" }, correlation: { commandId: "cmd-1" } }, held);
    expect(result?.status).toBe("recorded");
    const artifact = episodes.recordControl(
      { type: "artifact_intake", payload: { sha256: "abc" }, artifact: { mediaType: "image/png", bytes: new Uint8Array([1, 2, 3]), resourceKey: "sha256:abc" } },
      held
    );
    expect(artifact?.status).toBe("recorded");
    release();
    await running;
    const store = stores.get("project-1");
    const events = await storedEvents(store, "trace-1");
    expect(events.map((event) => [event.kind, event.messageType])).toEqual([
      ["control", "control.ask_answer"],
      ["control", "control.run_control"],
      ["artifact", "control.artifact_intake"],
      ["control", "control.artifact_intake"]
    ]);
    expect(events[1]?.correlation.commandId).toBe("cmd-1");
    expect(events[3]?.artifactIds).toEqual(events[2]?.artifactIds);
    expect((await store?.listArtifacts("trace-1"))?.map((presence) => presence.byteLength)).toEqual([3]);
    expect(events[1]?.payloadSchema).toEqual({ name: "automation-studio.control.run_control", version: "1" });
  });

  it("screens control events: a secret in a turn is withheld before storage", async () => {
    const { episodes, stores } = newEpisodes();
    await episodes.run(episode(), async () => {
      episodes.recordControl({ type: "append_turn", payload: { text: "use key sk-abcdefghij0123456789xyz", capabilities: [] } });
    });
    const [event] = await storedEvents(stores.get("project-1"), "trace-1");
    expect(event?.payload).toEqual({ encoding: "json", value: { text: "[withheld: secret]", capabilities: [] } });
    expect(event?.redactions).toEqual([{ path: "/text", reason: "secret" }]);
  });
});

describe("AutomationStudioGatewayTraceEpisodes: disabled", () => {
  it("does no work at all: no source, no store, no frame, no control events", async () => {
    const { episodes, storeRequests } = newEpisodes({ enabled: false });
    expect(episodes.gatewaySource).toBeUndefined();
    const answer = await episodes.run(episode({ flowId: "flow-1" }), async () => {
      expect(episodes.current()).toBeUndefined();
      expect(episodes.recordControl({ type: "append_turn", payload: { text: "hi" } })).toBeUndefined();
      expect(episodes.registry.size()).toBe(0);
      return 42;
    });
    expect(answer).toBe(42);
    expect(storeRequests).toEqual([]);
  });

  it("passes the work's promise through unchanged, rejection included", async () => {
    const { episodes } = newEpisodes({ enabled: false });
    const failure = new Error("boom");
    await expect(episodes.run(episode(), () => Promise.reject(failure))).rejects.toBe(failure);
  });
});

describe("AutomationStudioGatewayTraceEpisodes: construction", () => {
  it("refuses gateway streams that repeat or claim the control stream", () => {
    expect(() => newEpisodes({ gatewayStreams: ["gateway", "control"] })).toThrow("must be distinct");
    expect(() => newEpisodes({ gatewayStreams: ["gateway", "gateway"] })).toThrow("must be distinct");
  });
});
