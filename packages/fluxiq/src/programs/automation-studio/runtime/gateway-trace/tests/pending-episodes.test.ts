// A run's episode is named part way through its work, once its session is
// admitted (D9): the pending frame records into the episode it was entered
// from until then, and into the run's own trace after.
import { describe, expect, it } from "vitest";
import { episode, gatewayEvent, newEpisodes, storedEvents } from "./episode-builders.ts";

describe("AutomationStudioGatewayTraceEpisodes: pending frames", () => {
  it("records into the parent until named, into the named episode after, and closes it with how the work ended", async () => {
    const { episodes, stores } = newEpisodes();
    await episodes.run(episode({ episodeId: "build.1", activity: "exploration" }), async () => {
      await episodes.runPending(async () => {
        episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: "before" }, "client.before"));
        expect(episodes.current()?.episodeId).toBe("build.1");
        episodes.bindPending(episode({ episodeId: "run-9", activity: "execution" }));
        expect(episodes.current()?.episodeId).toBe("run-9");
        // A frame is named once.
        episodes.bindPending(episode({ episodeId: "run-10" }));
        expect(episodes.current()?.episodeId).toBe("run-9");
        episodes.gatewaySource?.current()?.record(gatewayEvent({ encoding: "text", text: "after" }, "client.after"));
        return "settled";
      });
    });
    const store = stores.get("project-1");
    const build = await storedEvents(store, "trace-1");
    expect(build.map((event) => event.messageType)).toEqual(["client.before", "control.child_episode_opened", "control.child_episode_closed"]);
    const run = await store?.readManifest("trace-2");
    expect(run).toMatchObject({ episodeId: "run-9", activity: "execution", terminationReason: "completed" });
    expect((await storedEvents(store, "trace-2")).map((event) => event.messageType)).toEqual(["client.after"]);
    expect(episodes.registry.size()).toBe(0);
  });

  it("closes a named pending episode failed on a throw and rethrows; opens nothing for a frame never named", async () => {
    const { episodes, stores, storeRequests } = newEpisodes();
    expect(await episodes.runPending(async () => "unnamed")).toBe("unnamed");
    expect(storeRequests).toEqual([]);
    const failure = new Error("the run broke");
    await expect(episodes.runPending(async () => {
      episodes.bindPending(episode({ episodeId: "run-3" }));
      throw failure;
    })).rejects.toBe(failure);
    expect(await stores.get("project-1")?.readManifest("trace-1")).toMatchObject({ episodeId: "run-3", terminationReason: "failed" });
  });

  it("does nothing outside a pending frame or with tracing off", async () => {
    const on = newEpisodes();
    on.episodes.bindPending(episode());
    expect(on.episodes.current()).toBeUndefined();
    await on.episodes.run(episode(), async () => {
      on.episodes.bindPending(episode({ episodeId: "run-2" }));
      expect(on.episodes.current()?.episodeId).toBe("run-1");
    });
    expect(on.storeRequests).toEqual(["project-1"]);
    const off = newEpisodes({ enabled: false });
    await off.episodes.runPending(async () => {
      off.episodes.bindPending(episode());
      expect(off.episodes.current()).toBeUndefined();
    });
    expect(off.storeRequests).toEqual([]);
  });

  it("screens the manifest context before it is stored", async () => {
    const { episodes, stores } = newEpisodes();
    const secret = "sk-abcdefghij0123456789xyz";
    await episodes.run(episode({ context: { schema: { name: "automation-studio.run-context", version: "1" }, value: { inputs: { note: `key ${secret}` } } } }), async () => undefined);
    const manifest = await stores.get("project-1")?.readManifest("trace-1");
    expect(JSON.stringify(manifest?.context)).not.toContain(secret);
    expect(manifest?.context.value).toEqual({ inputs: { note: "[withheld: secret]" } });
  });
});
