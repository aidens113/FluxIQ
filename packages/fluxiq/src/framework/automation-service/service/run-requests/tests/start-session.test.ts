// What of a start request's body reaches the run it opens: the fields a caller
// may name, as sent, and never the run's id or metadata, which are Core's own.

import { startRuntimeSessionInput } from "@fluxiq/contracts/program-api-inputs";
import { describe, expect, it } from "vitest";
import { startRuntimeSessionForRequest } from "../start-session.ts";

type Service = Parameters<typeof startRuntimeSessionForRequest>[0];

function harness() {
  const inputs: Array<Record<string, unknown>> = [];
  const service = {
    startRuntimeSession: async (input: Record<string, unknown>) => {
      inputs.push(input);
      return { runId: "run.queued", status: "queued" };
    }
  };
  const start = (payload: unknown) => startRuntimeSessionForRequest(service as unknown as Service, { payload });
  return { start, inputs };
}

describe("a start request", () => {
  it("opens the run with every field a caller may name, as sent", async () => {
    const h = harness();
    const sent = { projectId: "p", flow: { flowId: "f", nodes: [] }, flowId: "f", targetKind: "flow", targetId: "f", inputs: { q: 1 }, authorizedDomainIds: ["web-automation"] };
    const answer = await h.start(sent);
    expect(answer).toMatchObject({ ok: true, payload: { runtimeSession: { runId: "run.queued", status: "queued" } } });
    expect(h.inputs).toEqual([sent]);
  });

  it("drops the run's id, its metadata and anything else the body carries", async () => {
    const h = harness();
    await h.start({ projectId: "p", flowId: "f", runId: "run.other", metadata: { llmGate: { invoked: true }, commandOutcomeMode: "required" }, llmExecution: { actorUserId: "user.other", actorSessionId: "session.other", intent: "explore_and_adapt" }, caller: { userId: "user.other" } });
    expect(h.inputs).toEqual([{ projectId: "p", flowId: "f" }]);
  });

  it("opens the run from no body as from an empty one", async () => {
    const h = harness();
    await h.start(undefined);
    expect(h.inputs).toEqual([{}]);
  });

  it("opens the run from the assistant's parsed input unchanged", async () => {
    const h = harness();
    const parsed = startRuntimeSessionInput.parse({ projectId: "p", flowId: "f", inputs: { q: 1 } });
    await h.start(parsed);
    expect(h.inputs).toEqual([parsed]);
  });
});
