// How a request reaches answer-first mode (t861): by `configured` from a client that cannot read
// Core's setting, or by name. An extend builds as a candidate in either form, and an attempt's
// answer comes back whole. The other modes are told as they were.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAutomationStudioFlowBootstrapGenerationRequest } from "../../flow-bootstrap-commands/index.ts";
import { generateFlowBootstrapAdaptationForRequest } from "../generate.ts";

const ACTOR = { userId: "user.1", sessionId: "session.1" };

function dependencies(answer: Record<string, unknown>) {
  const asked: Array<Record<string, unknown>> = [];
  const service = {
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true }),
    generateFlowBootstrapAdaptation: async (input: Record<string, unknown>) => {
      asked.push(input);
      return answer;
    }
  } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["service"];
  return { asked, deps: { service, failedBuilds: { ended: () => undefined } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["failedBuilds"] } };
}

const payload = (over: Record<string, unknown>) => ({ projectId: "project.1", flowId: "flow.1", authSessionId: "session.1", evidenceGuided: true, ...over });
const ANSWERED = { projectId: "project.1", flowId: "flow.1", status: "answered", attempt: { status: "budget_out" } };

describe("a generation request in answer-first mode", () => {
  beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("resolves configured to answer-first, and answers an attempt whole, whatever its ending", async () => {
    const { asked, deps } = dependencies(ANSWERED);
    const response = await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "configured" }) });
    expect(asked[0]?.authoringMode).toBe("answer-first");
    expect(response).toEqual({ ok: true, payload: { answered: ANSWERED } });
  });

  it("answers a setup step as an answer, not a failure", async () => {
    const needed = { projectId: "project.1", flowId: "flow.1", status: "setup_needed", code: "flow_bootstrap.provider_resolver_unavailable", say: "Add a model key in settings." };
    const { deps } = dependencies(needed);
    expect(await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "configured" }) })).toEqual({ ok: true, payload: { setupNeeded: needed } });
  });

  it("takes it by name", async () => {
    const { asked, deps } = dependencies(ANSWERED);
    await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "answer-first" }) });
    expect(asked[0]?.authoringMode).toBe("answer-first");
  });

  it("builds an extend as a candidate, by either name, and at the service's own door", async () => {
    for (const authoringMode of ["configured", "answer-first"]) {
      const { asked, deps } = dependencies({ status: "draft" });
      await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode, mode: "extend" }) }).catch(() => undefined);
      expect(asked[0]?.authoringMode).toBe("candidate");
    }
    const read = readAutomationStudioFlowBootstrapGenerationRequest({ projectId: "project.1", flowId: "flow.1", evidenceGuided: true, authoringMode: "answer-first", mode: "extend", caller: { actorUserId: "user.1", actorSessionId: "session.1" } });
    expect(read.authoringMode).toBe("candidate");
    expect(readAutomationStudioFlowBootstrapGenerationRequest({ projectId: "project.1", flowId: "flow.1", evidenceGuided: true, authoringMode: "answer-first", caller: { actorUserId: "user.1", actorSessionId: "session.1" } }).authoringMode).toBe("answer-first");
  });

  it("refuses an answer that does not fit the mode asked for", async () => {
    const { deps } = dependencies(ANSWERED);
    const response = await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "candidate" }) });
    expect(response.ok).toBe(false);
  });

  it("still refuses a word it does not know", async () => {
    const { deps } = dependencies(ANSWERED);
    await expect(generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "guess" }) })).resolves.toMatchObject({ ok: false, error: "Candidate authoring requires evidence-guided generation." });
  });

  it("carries a valid humanness into the build input, 0 included, and refuses one outside 0 to 100 before anything runs", async () => {
    for (const humanness of [0, 60, 100]) {
      const { asked, deps } = dependencies(ANSWERED);
      await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "answer-first", humanness }) });
      expect(asked[0]?.humanness).toBe(humanness);
    }
    const none = dependencies(ANSWERED);
    await generateFlowBootstrapAdaptationForRequest(none.deps, { actor: ACTOR, payload: payload({ authoringMode: "answer-first" }) });
    expect(none.asked[0]).not.toHaveProperty("humanness");
    for (const bad of [101, 1.5, "x"]) {
      const { asked, deps } = dependencies(ANSWERED);
      expect(await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload({ authoringMode: "answer-first", humanness: bad }) })).toMatchObject({ ok: false, error: expect.stringMatching(/humanness/) });
      expect(asked).toEqual([]);
    }
  });
});
