// The wrappers the service's build and run entries call, and the host wiring
// (D9, D11): a build is one exploration episode whose id is its build id, a run
// is one execution episode named by its run id at admission, the start hook's
// answers land in the calling episode, and with nothing installed nothing is
// read, opened or stored.
import { afterEach, describe, expect, it } from "vitest";
import { runInAutomationStudioConversation } from "../../../conversations/context/index.ts";
import type { AutomationStudioGatewayTraceConversationReader } from "../index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../index.ts";
import {
  automationStudioGatewayTraceBuildId,
  automationStudioGatewayTraceStartHook,
  bindAutomationStudioGatewayTraceRun,
  createAutomationStudioGatewayTraceHost,
  withAutomationStudioGatewayTraceBuildActivity,
  withAutomationStudioGatewayTraceRunActivity
} from "../index.ts";
import { newEpisodes, storedEvents } from "../../tests/episode-builders.ts";

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

function installed() {
  const harness = newEpisodes();
  uninstall = AutomationStudioGatewayTraceInstallation.install(harness.episodes);
  return harness;
}

const INSTRUCTION = { schemaVersion: "0.1" as const, instructionId: "instruction.1", title: "List the items", body: "List every item on the page.", scope: { kind: "flow" as const, projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active" as const, requirement: "required" as const, createdAt: 1, updatedAt: 1 };

function conversationReader(): AutomationStudioGatewayTraceConversationReader {
  const turns = [
    { turnId: "turn.1", conversationId: "conversation.1", ordinal: 1, author: "person" as const, createdAt: 10, text: "Hello", actorId: "user.1", ask: null, attachment: null },
    { turnId: "turn.2", conversationId: "conversation.1", ordinal: 2, author: "automation" as const, createdAt: 11, text: "Hi", actorId: null, ask: null, attachment: null },
    { turnId: "turn.3", conversationId: "conversation.1", ordinal: 3, author: "person" as const, createdAt: 12, text: "Build me a list of the items", actorId: "user.1", ask: null, attachment: null },
    { turnId: "turn.4", conversationId: "conversation.1", ordinal: 4, author: "automation" as const, createdAt: 13, text: "Doing it", actorId: null, ask: null, attachment: null }
  ];
  return {
    available: true,
    getConversation: async (input: Parameters<AutomationStudioGatewayTraceConversationReader["getConversation"]>[0]) => {
      const from = input.sinceTurnId === undefined ? 0 : turns.findIndex((turn) => turn.turnId === input.sinceTurnId) + 1;
      const page = turns.slice(from, from + 2);
      return { conversation: { conversationId: "conversation.1" }, turns: page, hasMore: from + 2 < turns.length } as unknown as Awaited<ReturnType<AutomationStudioGatewayTraceConversationReader["getConversation"]>>;
    }
  };
}

describe("a build as one traced episode", () => {
  it("opens an exploration episode whose id is the build id, with the stored instructions and the turn that started it", async () => {
    const { episodes, stores } = installed();
    let buildId = "";
    let episodeId: string | undefined;
    await runInAutomationStudioConversation({ projectId: "project-1", conversationId: "conversation.1" }, () => withAutomationStudioGatewayTraceBuildActivity(
      { projectId: "project-1", flowId: "flow-1", authoringMode: "candidate", evidenceGuided: true },
      { instructions: async () => [INSTRUCTION], conversations: conversationReader() },
      async () => {
        buildId = automationStudioGatewayTraceBuildId();
        episodeId = episodes.current()?.episodeId;
        return { status: "proposed" };
      }
    ));
    expect(buildId).toMatch(/^build\.[0-9a-f-]{36}$/u);
    expect(episodeId).toBe(buildId);
    const manifest = await stores.get("project-1")?.readManifest("trace-1");
    expect(manifest).toMatchObject({ episodeId: buildId, activity: "exploration", terminationReason: "completed", context: { schema: { name: "automation-studio.build-context", version: "1" } } });
    expect(manifest?.context.value).toMatchObject({
      kind: "build",
      buildId,
      flowId: "flow-1",
      authoringMode: "candidate",
      evidenceGuided: true,
      instructions: { read: true, items: [{ instructionId: "instruction.1", body: "List every item on the page." }] },
      conversation: { conversationId: "conversation.1", turn: { turnId: "turn.3", text: "Build me a list of the items" }, unavailable: null }
    });
  });

  it("records instructions it could not read as unread, and the build still runs", async () => {
    const { stores } = installed();
    const answer = await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project-1", flowId: "flow-1" }, { instructions: async () => { throw new TypeError("gone"); } }, async () => "built");
    expect(answer).toBe("built");
    expect((await stores.get("project-1")?.readManifest("trace-1"))?.context.value).toMatchObject({ instructions: { read: false, failure: "TypeError" }, conversation: null });
  });

  it("with nothing installed reads nothing, opens nothing, and mints a fresh build id", async () => {
    let read = 0;
    const instructions = async () => {
      read += 1;
      return [];
    };
    const answer = await withAutomationStudioGatewayTraceBuildActivity({ projectId: "project-1", flowId: "flow-1" }, { instructions }, async () => automationStudioGatewayTraceBuildId());
    expect(answer).toMatch(/^build\./u);
    expect(read).toBe(0);
    expect(automationStudioGatewayTraceBuildId()).not.toBe(automationStudioGatewayTraceBuildId());
  });

  it("gives a build inside a run (a repair) a fresh id, not the run's", async () => {
    const { episodes } = installed();
    await episodes.run({ projectId: "project-1", episodeId: "run-1", activity: "execution", context: { schema: { name: "x", version: "1" }, value: null } }, async () => {
      expect(automationStudioGatewayTraceBuildId()).toMatch(/^build\./u);
    });
  });
});

describe("a run as one traced episode", () => {
  it("names the run's pending frame at admission with its id, its input and the turn that started it", async () => {
    const { episodes, stores } = installed();
    const session = await runInAutomationStudioConversation({ projectId: "project-1", conversationId: "conversation.1" }, () => withAutomationStudioGatewayTraceRunActivity({ projectId: "project-1", flowId: "flow-1" }, async () => {
      expect(episodes.current()).toBeUndefined();
      await bindAutomationStudioGatewayTraceRun({ runId: "run-42", projectId: "project-1", flowId: "flow-1" }, { inputs: { query: "lamps" }, conversations: conversationReader() });
      expect(episodes.current()?.episodeId).toBe("run-42");
      return { status: "succeeded" };
    }));
    expect(session.status).toBe("succeeded");
    const manifest = await stores.get("project-1")?.readManifest("trace-1");
    expect(manifest).toMatchObject({ episodeId: "run-42", activity: "execution", terminationReason: "completed" });
    expect(manifest?.context.value).toMatchObject({ kind: "run", runId: "run-42", flowId: "flow-1", inputs: { query: "lamps" }, conversation: { turn: { turnId: "turn.3" } } });
  });

  it("with nothing installed runs exactly the activity scope and stores nothing", async () => {
    const session = await withAutomationStudioGatewayTraceRunActivity({ projectId: "project-1", flowId: "flow-1" }, async () => {
      await bindAutomationStudioGatewayTraceRun({ runId: "run-1", projectId: "project-1", flowId: "flow-1" }, { inputs: {} });
      return { status: "succeeded" };
    });
    expect(session.status).toBe("succeeded");
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });
});

describe("the candidate start hook, recorded", () => {
  it("records the request identity and the answer into the calling episode, and the failure's kind only", async () => {
    const { episodes, stores } = installed();
    const answered = automationStudioGatewayTraceStartHook(async () => ({ reset: "done" }), episodes);
    const failing = automationStudioGatewayTraceStartHook(async () => { throw new RangeError("Bearer abc.def secret detail"); }, episodes);
    const request = { projectId: "project-1", flowId: "flow-1", candidateId: "candidate.1", revision: 2, digest: "d".repeat(64), signal: new AbortController().signal, lease: { resourceKey: "context.1", epoch: 3, sessionId: "session.1", holder: { role: "builder", briefId: "brief.1" } } };
    await episodes.run({ projectId: "project-1", episodeId: "build.1", activity: "exploration", context: { schema: { name: "x", version: "1" }, value: null } }, async () => {
      expect(await answered(request)).toEqual({ reset: "done" });
      await expect(failing(request)).rejects.toThrow(RangeError);
    });
    // Outside every episode the hook still answers, and nothing is recorded.
    expect(await answered(request)).toEqual({ reset: "done" });
    const events = await storedEvents(stores.get("project-1"), "trace-1");
    expect(events.map((event) => event.messageType)).toEqual(["control.start_hook_answer", "control.start_hook_answer"]);
    expect(events[0]?.payload).toMatchObject({ encoding: "json", value: { request: { candidateId: "candidate.1", revision: 2, lease: { resourceKey: "context.1", epoch: 3, holder: { briefId: "brief.1" } } }, outcome: "answered", answer: { reset: "done" } } });
    expect(events[1]?.payload).toMatchObject({ encoding: "json", value: { outcome: "failed", errorKind: "RangeError" } });
    expect(JSON.stringify(events)).not.toContain("secret detail");
  });
});

describe("the host wiring", () => {
  it("builds, installs and passes nothing when off, and hands back the start hook unchanged", () => {
    let pools = 0;
    const pool = () => {
      pools += 1;
      return undefined;
    };
    const host = createAutomationStudioGatewayTraceHost({ enabled: false, pool });
    const hook = async () => ({});
    expect(host.episodes).toBeUndefined();
    expect(host.source).toBeUndefined();
    expect(host.startHook(hook)).toBe(hook);
    expect(host.startHook(undefined)).toBeUndefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
    expect(pools).toBe(0);
  });

  it("installs one episodes object with the tap's streams and the contract versions when on, and a second host traces nothing", async () => {
    const host = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => undefined, options: { newTraceId: () => "trace-host" } });
    uninstall = host.uninstall;
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(host.episodes);
    expect(host.source).toBe(host.episodes?.gatewaySource);
    const second = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => undefined });
    expect(second.source).toBeUndefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(host.episodes);
    await host.episodes?.run({ projectId: "project-1", episodeId: "run-1", activity: "execution", context: { schema: { name: "x", version: "1" }, value: null } }, async () => undefined);
  });
});
