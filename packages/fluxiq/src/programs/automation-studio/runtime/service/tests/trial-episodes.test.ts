// Each trial a trial port runs is its own traced episode (traces and offline
// trials, P2, D9): activity `test`, the episode id the trial's run id, opened
// by the runner (`../candidate-trial/run.ts`, `../subflow-trial/run.ts`) after
// the trial's start, around the trial's own run. Inside a build the build's
// trace keeps markers naming the trial's trace; the start hook records into
// the build's trace whether the gate prepared it ahead of the trial or the
// runner called it (P3, D1).
import { afterEach, describe, expect, it } from "vitest";
import { ClientGatewayTraceMemoryStore, type ClientGatewayTraceEvent } from "../../../../../client-gateway/index.ts";
import { AutomationStudioGatewayTraceEpisodes, AutomationStudioGatewayTraceInstallation } from "../../gateway-trace/index.ts";
import { automationStudioGatewayTraceBuildId, automationStudioGatewayTraceStartHook, withAutomationStudioGatewayTraceBuildActivity } from "../../gateway-trace/wiring/index.ts";
import { automationStudioCandidateTrialPort } from "../candidate-trial/index.ts";
import { trialFixture } from "../candidate-trial/tests/fixtures.ts";
import { automationStudioSubflowTrialPort } from "../subflow-trial/index.ts";
import { subflowTrialFixture } from "../subflow-trial/tests/fixtures.ts";

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

function installEpisodes() {
  const store = new ClientGatewayTraceMemoryStore();
  let traces = 0;
  const episodes = new AutomationStudioGatewayTraceEpisodes({
    enabled: true,
    storeFor: () => store,
    now: () => 1_700_000_000_000,
    flush: { everyEvents: 1000, intervalMs: 60_000 },
    contractVersions: { "client-gateway.protocol": "0.1" },
    gatewayStreams: ["gateway", "artifact"],
    newTraceId: () => `trace-${++traces}`
  });
  uninstall = AutomationStudioGatewayTraceInstallation.install(episodes);
  return { episodes, store };
}

async function events(store: ClientGatewayTraceMemoryStore, traceId: string): Promise<readonly ClientGatewayTraceEvent[]> {
  return store.readEventRange(traceId, 1, Number.MAX_SAFE_INTEGER);
}

describe("a candidate trial as its own traced episode", () => {
  it("runs under the run id the port minted, in its own trace, and the build's trace keeps the markers and the start hook's answer", async () => {
    const { episodes, store } = installEpisodes();
    const fixture = trialFixture();
    fixture.ports.prepareStart = automationStudioGatewayTraceStartHook(async () => ({ put: "back" }), episodes);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    let buildId = "";
    await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => {
      buildId = automationStudioGatewayTraceBuildId();
      const signal = new AbortController().signal;
      expect(await trials.port.prepareStart!({ revision: 1, digest: fixture.candidate.digest, signal })).toBe("reset");
      await trials.port(fixture.request(signal));
    });
    // The fixture's minter was asked once, by the port; the runner used that id.
    expect(fixture.sessions.map((session) => session.runId)).toContain("trial.1");
    expect(new Set(fixture.sessions.map((session) => session.runId))).toEqual(new Set(["trial.1"]));
    expect(await store.readManifest("trace-1")).toMatchObject({ episodeId: buildId, activity: "exploration", terminationReason: "completed" });
    const trial = await store.readManifest("trace-2");
    expect(trial).toMatchObject({ episodeId: "trial.1", activity: "test", terminationReason: "completed", context: { schema: { name: "automation-studio.candidate-trial-context", version: "1" } } });
    expect(trial?.context.value).toMatchObject({ kind: "candidate_trial", runId: "trial.1", candidateId: "candidate.1", revision: 1, start: "reset" });
    const build = await events(store, "trace-1");
    expect(build.map((event) => event.messageType)).toEqual(["control.start_hook_answer", "control.child_episode_opened", "control.child_episode_closed"]);
    expect(build[1]?.payload).toMatchObject({ encoding: "json", value: { traceId: "trace-2", episodeId: "trial.1", activity: "test" } });
    expect((await events(store, "trace-2")).some((event) => event.messageType === "control.start_hook_answer")).toBe(false);
  });

  it("runs a start hook the gate did not prepare in the build's context: its answer is in the build's trace, the trial's run in the trial's", async () => {
    const { episodes, store } = installEpisodes();
    const fixture = trialFixture();
    fixture.ports.prepareStart = automationStudioGatewayTraceStartHook(async () => ({ put: "back" }), episodes);
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    const openedIn: (string | undefined)[] = [], judgedIn: (string | undefined)[] = [];
    const { openSession, judge } = fixture.ports;
    fixture.ports.openSession = async (input) => {
      openedIn.push(episodes.current()?.episodeId);
      return await openSession(input);
    };
    fixture.ports.judge = async (input) => {
      judgedIn.push(episodes.current()?.episodeId);
      return await judge(input);
    };
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => {
      await trials.port(fixture.request());
    });
    expect(new Set(fixture.sessions.map((session) => session.runId))).toEqual(new Set(["trial.1"]));
    const build = await events(store, "trace-1");
    expect(build.map((event) => event.messageType)).toEqual(["control.start_hook_answer", "control.child_episode_opened", "control.child_episode_closed"]);
    expect((await events(store, "trace-2")).some((event) => event.messageType === "control.start_hook_answer")).toBe(false);
    const trial = await store.readManifest("trace-2");
    expect(trial).toMatchObject({ episodeId: "trial.1", activity: "test" });
    expect(trial?.context.value).toMatchObject({ kind: "candidate_trial", runId: "trial.1", start: "reset" });
    // The trial's own run and its judge ran in the trial's episode.
    expect(openedIn).toEqual(["trial.1"]);
    expect(judgedIn).toEqual(["trial.1"]);
  });

  it("opens no trial episode when the unprepared start hook fails, and its failure is in the build's trace", async () => {
    const { episodes, store } = installEpisodes();
    const fixture = trialFixture();
    fixture.ports.prepareStart = automationStudioGatewayTraceStartHook(async () => { throw new RangeError("reset refused"); }, episodes);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    const result = await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => await trials.port(fixture.request()));
    expect(result.verdict).toBe("execution_failed");
    expect(fixture.sessions).toEqual([]);
    expect((await events(store, "trace-1")).map((event) => event.messageType)).toEqual(["control.start_hook_answer"]);
    expect(await store.readManifest("trace-2")).toBeUndefined();
  });

  it("opens no episode for a re-judgement, which runs nothing", async () => {
    const { store } = installEpisodes();
    const fixture = trialFixture();
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    fixture.setVerdict({ verdict: "not_judged", why: "The judge could not answer.", spent: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0, calls: 1 } });
    const signal = new AbortController().signal;
    await trials.port(fixture.request(signal));
    expect(await store.readManifest("trace-1")).toMatchObject({ episodeId: "trial.1", activity: "test" });
    await trials.port(fixture.request(signal));
    expect(await store.readManifest("trace-2")).toBeUndefined();
  });

  it("with nothing installed leaves the ports alone: the runner mints its own id", async () => {
    const fixture = trialFixture();
    const trials = automationStudioCandidateTrialPort("candidate.1", fixture.ports);
    await trials.port(fixture.request());
    expect(fixture.sessions[0]?.runId).toBe("trial.1");
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });
});

describe("a partial trial as its own traced episode", () => {
  it("runs each trial under the run id the port minted, in its own trace, with markers in the build's", async () => {
    const { store } = installEpisodes();
    const f = subflowTrialFixture();
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    const results = await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => await Promise.all([port(f.request()), port(f.request())]));
    expect(results.map((result) => result.trialRunId).sort()).toEqual(["subflow-trial.1", "subflow-trial.2"]);
    const manifests = await Promise.all(["trace-1", "trace-2", "trace-3"].map((traceId) => store.readManifest(traceId)));
    expect(manifests.map((manifest) => manifest?.activity)).toEqual(["exploration", "test", "test"]);
    expect(manifests.slice(1).map((manifest) => manifest?.episodeId).sort()).toEqual(["subflow-trial.1", "subflow-trial.2"]);
    expect(manifests[1]?.context.value).toMatchObject({ kind: "subflow_trial", buildId: "build.1", briefId: "brief.add", subflowKey: "add", revision: 3, digest: "add.3" });
    const build = await store.readEventRange("trace-1", 1, Number.MAX_SAFE_INTEGER);
    expect(build.filter((event) => event.messageType === "control.child_episode_opened")).toHaveLength(2);
    expect(build.filter((event) => event.messageType === "control.child_episode_closed")).toHaveLength(2);
  });

  it("runs a start hook the gate did not prepare in the build's context: its answer is in the build's trace, the trial's run in the trial's", async () => {
    const { episodes, store } = installEpisodes();
    const f = subflowTrialFixture();
    f.ports.prepareStart = automationStudioGatewayTraceStartHook(async () => ({ put: "back" }), episodes);
    const openedIn: (string | undefined)[] = [];
    const { openSession } = f.ports;
    f.ports.openSession = async (input) => {
      openedIn.push(episodes.current()?.episodeId);
      return await openSession(input);
    };
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    const result = await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => await port(f.request()));
    expect(result.trialRunId).toBe("subflow-trial.1");
    const build = await store.readEventRange("trace-1", 1, Number.MAX_SAFE_INTEGER);
    expect(build.map((event) => event.messageType)).toEqual(["control.start_hook_answer", "control.child_episode_opened", "control.child_episode_closed"]);
    expect((await store.readEventRange("trace-2", 1, Number.MAX_SAFE_INTEGER)).some((event) => event.messageType === "control.start_hook_answer")).toBe(false);
    const trial = await store.readManifest("trace-2");
    expect(trial).toMatchObject({ episodeId: "subflow-trial.1", activity: "test" });
    expect(trial?.context.value).toMatchObject({ kind: "subflow_trial", runId: "subflow-trial.1", start: "reset" });
    expect(openedIn).toEqual(["subflow-trial.1"]);
  });

  it("with a start prepared by the gate, the hook's answer is in the build's trace and the trial runs on that start", async () => {
    const { episodes, store } = installEpisodes();
    const f = subflowTrialFixture();
    let calls = 0;
    f.ports.prepareStart = automationStudioGatewayTraceStartHook(async () => {
      calls += 1;
      return { put: "back" };
    }, episodes);
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    const request = f.request();
    await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project", flowId: "parent" }, { instructions: async () => [] }, async () => {
      expect(await port.prepareStart!({ scope: request.scope, revision: request.proposal.revision, digest: request.proposal.digest, signal: request.signal })).toBe("reset");
      await port(request);
    });
    expect(calls).toBe(1);
    expect((await store.readEventRange("trace-1", 1, Number.MAX_SAFE_INTEGER)).map((event) => event.messageType)).toEqual(["control.start_hook_answer", "control.child_episode_opened", "control.child_episode_closed"]);
    expect((await store.readManifest("trace-2"))?.context.value).toMatchObject({ kind: "subflow_trial", start: "reset" });
  });

  it("with nothing installed leaves the ports alone", async () => {
    const f = subflowTrialFixture();
    const { port } = automationStudioSubflowTrialPort("build.1", f.ports);
    expect((await port(f.request())).trialRunId).toBe("subflow-trial.1");
  });
});
