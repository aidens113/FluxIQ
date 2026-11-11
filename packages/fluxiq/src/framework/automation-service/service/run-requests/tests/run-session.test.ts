// A run request's humanness, refused unless a whole number from 0 to 100 and
// handed to the run it starts; and what of a request's body reaches the run:
// the fields a caller may name, as sent, and never whose key pays and acts,
// which is the signed-in caller's alone.

import { runRuntimeSessionInput } from "@fluxiq/contracts/program-api-inputs";
import { describe, expect, it } from "vitest";
import { runRuntimeSessionForRequest } from "../run-session.ts";

type Service = Parameters<typeof runRuntimeSessionForRequest>[0];
type Caller = ReturnType<Service["conversations"]["callerFor"]>;

const REAL = { userId: "user.real", sessionId: "session.real" };
const OTHER = { actorUserId: "user.other", actorSessionId: "session.other", intent: "explore_and_adapt" };

function harness(caller: Partial<Caller> = {}) {
  // `inputs` is each run's input less `personUserId` (the signed-in person, set from the
  // authenticated actor alone; "the person a run is for" below checks it), so the comparisons of
  // what of a body reaches the run read as before; `people` keeps it.
  const inputs: Array<Record<string, unknown>> = [];
  const people: Array<unknown> = [];
  const asked: Array<{ userId: string; sessionId: string }> = [];
  const service = {
    conversations: {
      callerFor: (actor: { userId: string; sessionId: string }) => {
        asked.push(actor);
        return { userId: actor.userId, sessionId: actor.sessionId, preferredSessionId: null, paired: false, keyLocked: false, keyNeedsUnlock: false, keyLockReason: null, ...caller };
      }
    } as unknown as Service["conversations"],
    getFlowRunDetail: async () => null,
    runRuntimeSession: async ({ personUserId, ...input }: Record<string, unknown>) => {
      inputs.push(input);
      people.push(personUserId);
      return { runId: "run", status: "succeeded" };
    }
  };
  const run = (payload: unknown, actor: { userId: string; sessionId: string } | undefined = undefined) => runRuntimeSessionForRequest(service as unknown as Service, { payload, ...(actor ? { actor } : {}) });
  return { run, inputs, people, asked };
}

describe("a run request's humanness", () => {
  it.each([0, 25, 100])("accepts %s and reaches the run's input", async (humanness) => {
    const h = harness();
    const answer = await h.run({ projectId: "p", flowId: "f", humanness });
    expect(answer.ok).toBe(true);
    expect(h.inputs[0]).toMatchObject({ humanness });
  });

  it.each([101, -1, 1.5, "x", null])("refuses %s before any run starts", async (humanness) => {
    const h = harness();
    expect(await h.run({ projectId: "p", flowId: "f", humanness })).toMatchObject({ ok: false, error: expect.stringContaining("humanness") });
    expect(h.inputs).toEqual([]);
  });

  it("starts the run exactly as before when the request has none", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f" });
    expect(h.inputs[0]).toEqual({ projectId: "p", flowId: "f" });
    expect(h.inputs[0]).not.toHaveProperty("humanness");
  });
});

describe("whose key a run request's run pays and acts with", () => {
  it("ignores an execution context in the body when the request names no intent", async () => {
    const h = harness();
    expect((await h.run({ projectId: "p", flowId: "f", llmExecution: OTHER }, REAL)).ok).toBe(true);
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f" }]);
    expect(h.asked).toEqual([]);
  });

  it("ignores one sent with no signed-in caller at all", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f", llmExecution: OTHER, resultCheckCallerPays: "repair_checks" });
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f" }]);
  });

  it("runs an intent as the signed-in caller, whoever the body names", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f", runIntent: "explore_and_adapt", llmExecution: OTHER }, REAL);
    expect(h.asked).toEqual([REAL]);
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f", llmExecution: { actorUserId: "user.real", actorSessionId: "session.real", intent: "explore_and_adapt" } }]);
  });

  it("runs a paired client's intent as the person's unlocked session, never the body's", async () => {
    const h = harness({ paired: true, sessionId: "session.unlocked", preferredSessionId: "session.unlocked" });
    await h.run({ projectId: "p", flowId: "f", runIntent: "explore_and_adapt", llmExecution: OTHER }, { userId: "user.real", sessionId: "client-gateway:1" });
    expect(h.inputs[0]).toEqual({ projectId: "p", flowId: "f", llmExecution: { actorUserId: "user.real", actorSessionId: "session.unlocked", intent: "explore_and_adapt" }, resultCheckCallerPays: "repair_checks" });
  });

  it("runs keyless when the caller has nothing unlocked, rather than with the body's", async () => {
    const h = harness({ paired: true, keyLocked: true });
    await h.run({ projectId: "p", flowId: "f", runIntent: "explore_and_adapt", llmExecution: OTHER }, { userId: "user.real", sessionId: "client-gateway:1" });
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f" }]);
  });

  it("drops every field the run's input does not take from a body", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f", caller: { actorUserId: "user.other" }, actor: { userId: "user.other" }, metadata: { llmGate: {} }, scope: { domainId: "d" } }, REAL);
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f" }]);
  });
});

describe("a run request's own fields", () => {
  it("reach the run exactly as sent", async () => {
    const h = harness();
    const flow = { flowId: "f", nodes: [] };
    const sent = {
      projectId: "p", commandOutcomeMode: "required", runId: "run.1", newRunId: "run.2", flow, flowId: "f", inputs: { q: 1 }, maxSteps: 5,
      authorizedDomainIds: ["web-automation"], adaptiveMode: "manual_approval", dryRunLlm: true, authorizedExternalSideEffects: false,
      subflowId: "s", idempotencyKey: "k", useReusableContext: true
    };
    await h.run(sent, REAL);
    expect(h.inputs).toEqual([sent]);
  });

  it("carry what is read and checked here as before", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f", runIntent: "explore_and_adapt", resultCheckCallerPays: "repair_checks", permittedConsequences: ["modify_existing"], interpretationCostUsd: 0.001, interpretationCalls: 2, humanness: 40 }, REAL);
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f", llmExecution: { actorUserId: "user.real", actorSessionId: "session.real", intent: "explore_and_adapt" }, permittedConsequences: ["modify_existing"], resultCheckCallerPays: "repair_checks", interpretationCostUsd: 0.001, interpretationCalls: 2, humanness: 40 }]);
  });

  it("refuse an invalid reusable-context flag before any run starts", async () => {
    const h = harness();
    expect(await h.run({ projectId: "p", flowId: "f", useReusableContext: false }, REAL)).toMatchObject({ ok: false });
    expect(h.inputs).toEqual([]);
  });

  it("from the assistant's parsed input reach the run unchanged", async () => {
    const h = harness();
    const parsed = runRuntimeSessionInput.parse({ projectId: "p", flowId: "f", inputs: { q: 1 }, runId: "run.1", maxSteps: 5, llmExecution: OTHER });
    expect(parsed).toEqual({ projectId: "p", flowId: "f", inputs: { q: 1 }, runId: "run.1", maxSteps: 5 });
    await h.run(parsed, REAL);
    expect(h.inputs).toEqual([parsed]);
  });
});

describe("the person a run is for", () => {
  it("is the signed-in caller, whether or not a run intent or an unlocked key comes with it", async () => {
    const locked = harness({ keyLocked: true });
    await locked.run({ projectId: "p", flowId: "f" }, REAL);
    await locked.run({ projectId: "p", flowId: "f", runIntent: "explore_and_adapt" }, REAL);
    expect(locked.people).toEqual(["user.real", "user.real"]);
  });

  it("is never a person the body names, and is absent with no signed-in caller", async () => {
    const h = harness();
    await h.run({ projectId: "p", flowId: "f", personUserId: "user.other" }, REAL);
    await h.run({ projectId: "p", flowId: "f", personUserId: "user.other" });
    expect(h.people).toEqual(["user.real", undefined]);
    expect(h.inputs.every((input) => !("personUserId" in input))).toBe(true);
  });
});
