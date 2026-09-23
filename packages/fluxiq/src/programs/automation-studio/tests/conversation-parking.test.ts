// A run stops on a question, a person answers it in the thread, and the run
// goes on from the answer.
//
// This is the loop end to end, through the real pieces and nothing else: a real
// `AutomationStudioService` on a temporary data directory, a real project
// database, the approval node raising a real ask, the conversation the service
// binds as the run's parking port, and the answer arriving through the
// registered `answer-ask` endpoint the way the panel sends it. No stub port, no
// fake store, no provider, and no network.
//
// Four separate facts are worth pinning and all four are here: that a run's
// question reaches a thread at all; that answering it in the thread moves the
// run; that the run goes down the branch the answer chose with everything it
// had already done still in hand and the parked node never executed twice; and
// that nobody answering takes the route the node declared for silence and
// leaves the question closed rather than pending forever.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import type { ProgramApiActor } from "../../_shared/api.ts";
import { IoRegistry } from "../../../io/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../api/contracts.ts";
import { registerAutomationStudioApi } from "../api/handlers/index.ts";
import type { AutomationStudioConversation, AutomationStudioConversationThread } from "../runtime/index.ts";
import { AutomationStudioService } from "../runtime/service.ts";

const DOMAIN_ID = "example";
const PROMPT = "Publish the draft?";

/** Everything a caller needs to be: the two permissions the conversation endpoints take. */
const ACTOR: ProgramApiActor = { sessionId: "session.person", userId: "user.person", roleId: "admin", permissions: ["programs.read", "programs.write"] };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-conversation-parking-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** A service whose two outputs record that they were dispatched, so a resume that repeated work would show it. */
function startService(dispatched: string[]): AutomationStudioService {
  const io = new IoRegistry();
  for (const outputId of ["send-draft", "discard-draft"]) {
    io.registerOutput(DOMAIN_ID, {
      definition: { id: outputId, title: outputId },
      mode: "request",
      dispatch: (request) => {
        dispatched.push(request.outputId);
        return { ok: true, domainId: DOMAIN_ID, outputId: request.outputId, payload: {} };
      }
    });
  }
  const service = new AutomationStudioService({ dataDir: path.join(tempRoot, ".fluxiq", "data") }).bindIoRuntime(io, DOMAIN_ID);
  services.add(service);
  return service;
}

/**
 * Sends a draft, then asks before publishing it. Everything before the approval
 * is work a resume must not repeat: the variable the run wrote, and the one
 * dispatch it already made.
 */
async function approvalFlow(service: AutomationStudioService, projectId: string, input: { flowId: string; timeoutMs: number; defaultRoute: string }) {
  const flow = await service.createFlow({ projectId, flowId: input.flowId, name: input.flowId });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({
    projectId,
    flow: {
      ...blank,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
        { id: "draft", definitionId: "builtin.data.constant", parameterValues: { value: "draft-42" } },
        { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: "draftId", writeMode: "replace" } },
        { id: "send", definitionId: "builtin.policy.action", parameterValues: { outputId: "send-draft", parameters: {} } },
        { id: "approve", definitionId: "builtin.routine.approval", parameterValues: { prompt: PROMPT, timeoutMs: input.timeoutMs, defaultRoute: input.defaultRoute } },
        { id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: "draftId" } },
        { id: "discard", definitionId: "builtin.policy.action", parameterValues: { outputId: "discard-draft", parameters: {} } },
        { id: "done", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "e.start", sourceNodeId: "start", targetNodeId: "draft", sourcePortId: "success", targetPortId: "in" },
        { id: "e.draft", sourceNodeId: "draft", targetNodeId: "remember", sourcePortId: "success", targetPortId: "in" },
        { id: "e.remember", sourceNodeId: "remember", targetNodeId: "send", sourcePortId: "success", targetPortId: "in" },
        { id: "e.send", sourceNodeId: "send", targetNodeId: "approve", sourcePortId: "success", targetPortId: "in" },
        { id: "e.approved", sourceNodeId: "approve", targetNodeId: "recall", sourcePortId: "approved", targetPortId: "in" },
        { id: "e.rejected", sourceNodeId: "approve", targetNodeId: "discard", sourcePortId: "rejected", targetPortId: "in" },
        { id: "e.recalled", sourceNodeId: "recall", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" },
        { id: "e.discarded", sourceNodeId: "discard", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return flow;
}

/** The API as a caller reaches it: the registered endpoints, called with the project's own domain scope. */
function conversationApi(service: AutomationStudioService) {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const call = async (endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const answer = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: DOMAIN_ID }, actor: ACTOR, payload });
    if (!answer.ok) throw new Error(`${endpoint} refused: ${answer.error}`);
    return (answer.payload ?? {}) as Record<string, unknown>;
  };
  return {
    listConversations: async (projectId: string): Promise<AutomationStudioConversation[]> =>
      (await call(AUTOMATION_STUDIO_ENDPOINTS.listConversations, { projectId })).conversations as AutomationStudioConversation[],
    getConversation: async (projectId: string, conversationId: string): Promise<AutomationStudioConversationThread> =>
      (await call(AUTOMATION_STUDIO_ENDPOINTS.getConversation, { projectId, conversationId })).conversation as AutomationStudioConversationThread,
    answerAsk: async (projectId: string, askId: string, kind: string): Promise<Record<string, unknown>> =>
      (await call(AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk, { projectId, askId, kind })).ask as Record<string, unknown>
  };
}

/**
 * The thread the waiting run opened, read through the endpoints rather than out
 * of the store, because what this proves is that a person could have found it.
 */
async function waitForPendingAsk(api: ReturnType<typeof conversationApi>, projectId: string): Promise<AutomationStudioConversationThread> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    for (const conversation of await api.listConversations(projectId)) {
      if (conversation.pendingAskCount > 0) return await api.getConversation(projectId, conversation.conversationId);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No conversation carried a pending ask: the run's question never reached a thread.");
}

describe("a run that asks a person, and goes on from their answer", () => {
  it("puts the question in a thread, resumes down the answered route, and repeats nothing it had already done", { timeout: 180_000 }, async () => {
    const dispatched: string[] = [];
    const service = startService(dispatched);
    const api = conversationApi(service);
    const project = await service.createProject({ name: "Conversation parking", domainId: DOMAIN_ID });
    const flow = await approvalFlow(service, project.id, { flowId: "flow.approve", timeoutMs: 0, defaultRoute: "rejected" });

    // The run is not awaited: it is waiting on the person, which is the point.
    const running = service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const thread = await waitForPendingAsk(api, project.id);

    // The question reached the thread as a turn FluxIQ wrote, in Core's own words.
    const asking = thread.turns.find((turn) => turn.ask !== null);
    expect(asking?.author).toBe("automation");
    expect(asking?.text).toBe(PROMPT);
    expect(thread.conversation.subject).toEqual({ kind: "run", id: expect.any(String) });
    expect(asking?.ask).toMatchObject({
      kind: "confirm",
      status: "pending",
      parks: true,
      routes: { granted: "approved", denied: "rejected", timedOut: "rejected" }
    });

    // Answered the way the panel answers it: through the endpoint, by ask id.
    const askId = asking!.ask!.askId;
    expect(await api.answerAsk(project.id, askId, "grant")).toMatchObject({ askId, status: "answered", answer: { kind: "grant", actorId: ACTOR.userId } });

    const session = await running;
    expect(session.status).toBe("succeeded");
    // One run, not two: the node it parked at ran once, and the dispatch it had already made was not repeated.
    expect(session.trace?.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "recall", "done"]);
    expect(dispatched).toEqual(["send-draft"]);
    // The work it did before the question is still there after it.
    expect(session.trace?.values["recall.value"]).toBe("draft-42");
    expect(session.trace?.attempts.find((attempt) => attempt.nodeId === "approve")?.ask).toMatchObject({ askId, status: "answered", route: "approved" });
    expect(session.trace?.parked).toBeUndefined();

    // And the thread says the question was settled, so nobody is shown a question that is no longer open.
    const settled = await api.getConversation(project.id, thread.conversation.conversationId);
    expect(settled.conversation.pendingAskCount).toBe(0);
    expect(settled.turns.find((turn) => turn.ask !== null)?.ask).toMatchObject({ status: "answered", answer: { kind: "grant" } });
  });

  it("takes the route the node declared for silence when nobody answers, and closes the question rather than leaving it pending", { timeout: 180_000 }, async () => {
    const dispatched: string[] = [];
    const service = startService(dispatched);
    const api = conversationApi(service);
    const project = await service.createProject({ name: "Conversation timeout", domainId: DOMAIN_ID });
    const flow = await approvalFlow(service, project.id, { flowId: "flow.timeout", timeoutMs: 1_500, defaultRoute: "rejected" });

    const session = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    expect(session.status).toBe("succeeded");
    expect(session.trace?.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "discard", "done"]);
    expect(dispatched).toEqual(["send-draft", "discard-draft"]);
    expect(session.trace?.attempts.find((attempt) => attempt.nodeId === "approve")?.ask).toMatchObject({ status: "expired", route: "rejected" });

    const [conversation] = await api.listConversations(project.id);
    const thread = await api.getConversation(project.id, conversation!.conversationId);
    expect(thread.conversation.pendingAskCount).toBe(0);
    expect(thread.turns.find((turn) => turn.ask !== null)?.ask).toMatchObject({ status: "expired", answer: null });
  });
});
