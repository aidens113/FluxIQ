// A request that starts an answer-first attempt counts it as in flight for the attempt's whole
// length, a wait on a person included, and stops counting when it ended or threw. Another mode's
// build is not an attempt.
import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptsInFlight } from "../../answer-first/attempt-in-flight/index.ts";
import { generateFlowBootstrapAdaptationForRequest } from "../generate.ts";

const ACTOR = { userId: "user.1", sessionId: "session.1" };
const payload = (authoringMode: string) => ({ projectId: "project.1", flowId: "flow.1", authSessionId: "session.1", evidenceGuided: true, authoringMode });

function waitingService(run: () => Promise<unknown>) {
  const service = {
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true }),
    generateFlowBootstrapAdaptation: run
  } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["service"];
  const failedBuilds = { ended: () => undefined } as unknown as Parameters<typeof generateFlowBootstrapAdaptationForRequest>[0]["failedBuilds"];
  return { service, deps: { service, failedBuilds } };
}

describe("an attempt in flight", () => {
  it("is counted while it waits on a person, and not once it answered", async () => {
    let answer!: () => void;
    const { service, deps } = waitingService(() => new Promise((resolve) => { answer = () => resolve({ projectId: "project.1", flowId: "flow.1", status: "answered", attempt: { status: "budget_out" } }); }));
    const request = generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload("answer-first") });
    expect(automationStudioTaskAttemptsInFlight(service)).toBe(1);
    answer();
    expect((await request).ok).toBe(true);
    expect(automationStudioTaskAttemptsInFlight(service)).toBe(0);
  });

  it("is not counted once it threw", async () => {
    const { service, deps } = waitingService(async () => { throw new Error("provider down"); });
    const response = await generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload("answer-first") });
    expect(response.ok).toBe(false);
    expect(automationStudioTaskAttemptsInFlight(service)).toBe(0);
  });

  it("does not count another mode's build", async () => {
    let end!: () => void;
    const { service, deps } = waitingService(() => new Promise((resolve) => { end = () => resolve({ status: "draft", candidate: {} }); }));
    const request = generateFlowBootstrapAdaptationForRequest(deps, { actor: ACTOR, payload: payload("candidate") }).catch(() => undefined);
    expect(automationStudioTaskAttemptsInFlight(service)).toBe(0);
    end();
    await request;
  });
});
