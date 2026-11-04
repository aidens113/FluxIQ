// A re-run from the start is declined where a lasting act may have landed, and a
// repair asks that before it builds. A pass after the first ran a graph the stored
// Flow does not hold, so it is that pass's word which counts, not the stored Flow's.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../../../executor/index.ts";
import { automationStudioMetadataWithRerunPass, automationStudioRunMayHaveActedLastingly } from "../lasting-acts.ts";
import { automationStudioRerunPreflight } from "../preflight.ts";

const attempt = (nodeId: string, definitionId: string): AutomationStudioNodeAttemptTrace => ({ attemptId: `attempt.${nodeId}`, nodeId, definitionId, startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] });
const session = (attempts: AutomationStudioNodeAttemptTrace[], metadata: JsonObject = {}) => ({ trace: { attempts }, metadata }) as unknown as Pick<AutomationStudioRuntimeSession, "trace" | "metadata">;
const NO_RECEIPTS = { metadata: {} } as Pick<AutomationStudioFlowRunDetail, "metadata">;

const stored = { nodes: [{ id: "search", definitionId: "web.action.click" }] };
const first = attempt("search", "web.action.click");

describe("a pass after the first", () => {
  it("is read by its own word: its steps on a graph the stored Flow lacks are not unknown", async () => {
    const pass = [attempt("added", "web.action.click")];
    const said = await automationStudioMetadataWithRerunPass({ metadata: {}, flow: { nodes: [{ id: "added", definitionId: "web.action.click" }] }, attemptsBefore: 1, pass });
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session([first, ...pass], said), detail: NO_RECEIPTS })).resolves.toBe(false);
    // With nothing said, a domain step of no known graph counts: not knowing is not a no.
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session([first, ...pass]), detail: NO_RECEIPTS })).resolves.toBe(true);
  });

  it("counts a step its own graph says lastingly acts, though the stored Flow does not hold it", async () => {
    const pass = [attempt("added", "builtin.policy.action")];
    const said = await automationStudioMetadataWithRerunPass({ metadata: {}, flow: { nodes: [{ id: "added", definitionId: "builtin.policy.action", metadata: { effect: "mutate" } }] }, attemptsBefore: 1, pass });
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session([first, ...pass], said), detail: NO_RECEIPTS })).resolves.toBe(true);
  });

  it("keeps a later pass from clearing what an earlier one said", async () => {
    const lasting = await automationStudioMetadataWithRerunPass({ metadata: {}, flow: { nodes: [{ id: "added", definitionId: "builtin.policy.action", metadata: { effect: "mutate" } }] }, attemptsBefore: 1, pass: [attempt("added", "builtin.policy.action")] });
    const later = await automationStudioMetadataWithRerunPass({ metadata: lasting, flow: stored, attemptsBefore: 2, pass: [first] });
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session([first, first, first], later), detail: NO_RECEIPTS })).resolves.toBe(true);
  });

  it("still reads the first pass against the graph it ran", async () => {
    const said = await automationStudioMetadataWithRerunPass({ metadata: {}, flow: stored, attemptsBefore: 1, pass: [attempt("search", "web.action.click")] });
    const lastingStored = { nodes: [{ id: "search", definitionId: "web.action.click", metadata: { effect: "mutate" } }] };
    await expect(automationStudioRunMayHaveActedLastingly({ flow: lastingStored, session: session([first, first], said), detail: NO_RECEIPTS })).resolves.toBe(true);
  });

  it("counts a pass whose called part cannot be read", async () => {
    const pass = [{ ...attempt("call", "builtin.flow.call"), subflowTarget: { subflowId: "part" }, childTrace: { attempts: [first] } }] as unknown as AutomationStudioNodeAttemptTrace[];
    const said = await automationStudioMetadataWithRerunPass({ metadata: {}, flow: { nodes: [{ id: "call", definitionId: "builtin.flow.call" }] }, attemptsBefore: 0, pass, graphOptions: { subflowGraphs: { load: async () => { throw new Error("gone"); } } as unknown as NonNullable<AutomationStudioGraphExecutionOptions["subflowGraphs"]> } });
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session(pass, said), detail: NO_RECEIPTS })).resolves.toBe(true);
  });
});

describe("a trial", () => {
  it("counts where its receipt says it acted lastingly, though no pass's trace holds what it did", async () => {
    const detail = { metadata: { runtimePatchAttempts: [{ kind: "temporary_target_override", actedLastingly: true }] } } as unknown as Pick<AutomationStudioFlowRunDetail, "metadata">;
    await expect(automationStudioRunMayHaveActedLastingly({ flow: stored, session: session([first]), detail })).resolves.toBe(true);
  });
});

describe("what a repair asks before it builds", () => {
  const flow = { flowId: "flow.one", nodes: stored.nodes, metadata: {} } as unknown as AutomationStudioFlowArtifact;
  const detail = { summary: { runId: "run.one" }, metadata: {} } as unknown as AutomationStudioFlowRunDetail;
  const ports = (overrides: Partial<Parameters<typeof automationStudioRerunPreflight>[0]["ports"]> = {}) => ({
    getRuntimeSession: async () => ({ flowId: "flow.one", trace: { attempts: [first] }, metadata: {} }) as unknown as AutomationStudioRuntimeSession,
    getFlow: async () => flow,
    getFlowSubflow: async () => null,
    ...overrides
  });

  it("is clear where nothing lasting was stated", async () => {
    await expect(automationStudioRerunPreflight({ ports: ports(), projectId: "project.one", detail })).resolves.toEqual({ clear: true });
  });

  it("answers the re-run's own code where a step the first pass ran says it lastingly acts", async () => {
    const lasting = { ...flow, nodes: [{ id: "search", definitionId: "web.action.click", metadata: { effect: "mutate" } }] } as AutomationStudioFlowArtifact;
    await expect(automationStudioRerunPreflight({ ports: ports({ getFlow: async () => lasting }), projectId: "project.one", detail })).resolves.toEqual({ declined: "repair_rerun.lasting_act_may_have_landed" });
  });

  it("says it could not read a graph or a session, which is not clear and stops nothing", async () => {
    await expect(automationStudioRerunPreflight({ ports: ports({ getFlow: async () => { throw new Error("gone"); } }), projectId: "project.one", detail })).resolves.toEqual({ unread: "graph" });
    await expect(automationStudioRerunPreflight({ ports: ports(), projectId: "project.one", detail, subflowId: "subflow.one" })).resolves.toEqual({ unread: "graph" });
    await expect(automationStudioRerunPreflight({ ports: ports({ getRuntimeSession: async () => { throw new Error("gone"); } }), projectId: "project.one", detail })).resolves.toEqual({ unread: "session" });
    await expect(automationStudioRerunPreflight({ ports: ports({ getRuntimeSession: async () => null }), projectId: "project.one", detail })).resolves.toEqual({ unread: "session" });
  });
});
