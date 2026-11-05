// The thread that asked for an attempt is noted before the attempt starts (t869), so it lists the
// attempt's working row, and a note not written never costs the person the task.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFlowBootstrapAdaptationForRequest } from "../generate.ts";

const ACTOR = { userId: "user.1", sessionId: "session.1" };
const ANSWERED = { projectId: "project.1", flowId: "flow.1", status: "answered", attempt: { status: "achieved" } };

function dependencies(note: (projectId: string, conversationId: string, flowId: string) => Promise<void>) {
  const order: string[] = [];
  const service = {
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true }),
    generateFlowBootstrapAdaptation: async () => {
      order.push("attempt");
      return ANSWERED;
    }
  } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["service"];
  return {
    order,
    deps: {
      service,
      failedBuilds: { ended: () => undefined } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["failedBuilds"],
      noteConversation: async (projectId: string, conversationId: string, flowId: string) => {
        order.push(`note ${projectId} ${conversationId} ${flowId}`);
        await note(projectId, conversationId, flowId);
      }
    }
  };
}

const payload = (over: Record<string, unknown> = {}) => ({ projectId: "project.1", flowId: "flow.1", authSessionId: "session.1", evidenceGuided: true, authoringMode: "configured", conversationId: "conversation.1", ...over });

describe("a generation request naming its thread", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("notes the thread before the attempt starts", async () => {
    const { order, deps } = dependencies(async () => undefined);
    await expect(generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload() })).resolves.toEqual({ ok: true, payload: { answered: ANSWERED } });
    expect(order).toEqual(["note project.1 conversation.1 flow.1", "attempt"]);
  });

  it("still does the task when the note cannot be written, and the answer says so", async () => {
    const { order, deps } = dependencies(async () => { throw new Error("The disk is full."); });
    await expect(generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload() })).resolves.toEqual({ ok: true, payload: { answered: ANSWERED, threadNotNoted: true } });
    expect(order.at(-1)).toBe("attempt");
  });

  it("notes nothing with no thread named", async () => {
    const { order, deps } = dependencies(async () => undefined);
    await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ conversationId: undefined }) });
    expect(order).toEqual(["attempt"]);
  });

  it("refuses a thread it cannot read as an id, before anything starts", async () => {
    const { order, deps } = dependencies(async () => undefined);
    await expect(generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ conversationId: 7 }) })).rejects.toThrow("Conversation identifier is required.");
    expect(order).toEqual([]);
  });

  it("notes nothing in another mode, where no attempt is made", async () => {
    vi.stubEnv("FLUXIQ_AUTHORING_MODE", "candidate");
    const { order, deps } = dependencies(async () => undefined);
    await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload() });
    expect(order).toEqual(["attempt"]);
  });
});
