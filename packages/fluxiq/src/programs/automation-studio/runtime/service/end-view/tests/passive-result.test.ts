import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { runAutomationStudioCandidateTrial } from "../../candidate-trial/index.ts";
import { trialFixture } from "../../candidate-trial/tests/fixtures.ts";
import { harness, verify } from "../../../result-verification/tests/run-outcome-harness.ts";
import { automationStudioLlmEvidenceRuntimeBindingChecked } from "../../../llm/domain-instructions/index.ts";
import { automationStudioRunEndViewReader } from "../index.ts";

const STALE = "Visible status: nine available";
const CURRENT = "Visible status: nine available\nNot rendered: ledger eight available";
type Observe = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["observeResult"]>;
function runtime(observe: Observe) {
  return Object.assign({ domainId: "neutral", systemInstructions: { version: "neutral.v1", text: "Operate the declared neutral medium." }, tools: [], observedStateKeys: ["page"], deniedEvidenceKeys: ["private"],
    runsNodes: { initial: { node: "neutral.look", parameters: {} } }, executeTool: vi.fn(async () => ({ page: STALE }))
  } satisfies AutomationStudioLlmEvidenceRuntimeBinding, { observeResult: observe });
}

describe("passive domain result observation", () => {
  it("preserves the callback through checked binding and sends current evidence to actual trial and saved summaries", async () => {
    const observe = vi.fn(async (_request: Parameters<Observe>[0]) => ({ page: CURRENT, bookkeeping: "withheld" }));
    const bound = automationStudioLlmEvidenceRuntimeBindingChecked(runtime(observe));
    expect(bound.observeResult).toBe(observe);
    const read = automationStudioRunEndViewReader(bound)!;
    const fixture = trialFixture();
    fixture.ports.deniedEvidenceKeys = ["private"];
    fixture.ports.readEndView = ({ runId }) => read({ projectId: "project", flowId: "flow", runId });
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(fixture.judged[0]?.summary.endView).toEqual({ view: { page: CURRENT } });
    const context = harness({ answer: "yes" });
    await verify(context, { ports: { ...context.ports, deniedEvidenceKeys: ["private"], readEndView: read } });
    expect(context.requests[0]?.context.resultSummary?.endView).toEqual({ view: { page: CURRENT } });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(bound.executeTool).not.toHaveBeenCalled();
    for (const [request] of observe.mock.calls) {
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(await request.permission({ consequences: ["move_money"], verb: "press", control: { name: "Transfer", kind: "button" } })).toMatchObject({ permitted: false });
      expect(request).not.toHaveProperty("startLocation");
    }
  });

  it("cancels a passive callback that never returns without switching to a stale fallback", async () => {
    let signal: AbortSignal | undefined;
    const bound = runtime(async (request) => {
      signal = request.signal;
      return new Promise<undefined>(() => undefined);
    });
    const read = automationStudioRunEndViewReader(bound, { timeoutMs: 15 })!;
    await expect(read({ projectId: "p", flowId: "f", runId: "r" })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(signal?.aborted).toBe(true);
    expect(bound.executeTool).not.toHaveBeenCalled();
  });

  it("screens denied passive views and records absent views without recycling the ordinary look", async () => {
    const bound = runtime(async () => ({ page: CURRENT, private: "not public" }));
    bound.observedStateKeys = ["page", "private"];
    const context = harness({ answer: "yes" });
    await verify(context, { ports: { ...context.ports, deniedEvidenceKeys: ["private"], readEndView: automationStudioRunEndViewReader(bound) } });
    expect(context.requests[0]?.context.resultSummary).toMatchObject({ withheld: true });
    expect(context.requests[0]?.context.resultSummary).not.toHaveProperty("endView");
    const absent = runtime(async () => undefined);
    expect(await automationStudioRunEndViewReader(absent)!({ projectId: "p", flowId: "f", runId: "r" })).toBeUndefined();
    expect(absent.executeTool).not.toHaveBeenCalled();
  });
});
