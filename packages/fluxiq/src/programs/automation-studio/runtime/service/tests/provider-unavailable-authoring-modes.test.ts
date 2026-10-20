// @fluxiq-test-group real-sql
// A candidate build and a project build whose model provider answers nothing,
// through the real `generateFlowBootstrapAdaptation` (t619).
//
// A8 canary `run-mv8zw5l2-98064abf`: DeepSeek answered none of the project
// supervisor's three decisions, each `llm.provider_timeout`, and the build
// ended `flow_bootstrap.post_provider_validation_failed`, the person reading
// "The supervisor ended the build: it could not finish the Flow" and "The
// build failed: what the model wrote could not be used". The model wrote
// nothing and the supervisor ended nothing. Both authoring modes now end
// through the one classification (`flow-bootstrap/generation-failure/
// evidence-failure.ts`) as `flow_bootstrap.provider_unavailable`, saying the
// provider did not answer and nothing was built. A reply that did arrive and
// ended the build without a Flow still ends as it did.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../activity/index.ts";
import { automationStudioConversationCallCause } from "../../conversations/commands/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { AutomationStudioService } from "../../service.ts";
import { blankFixture, caller, mockProvider, rejectedGenerationDiagnostic } from "../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});

afterEach(async () => {
  unsubscribe();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** What the DeepSeek adapter throws when its own deadline passes with no answer; its words are the provider's, never said to the person. */
const PROVIDER_WORDS = "DeepSeek did not respond before the request timeout.";
const timedOut = () => new AutomationStudioLlmProviderError("llm.provider_timeout", PROVIDER_WORDS, true);
const unreachable = () => new AutomationStudioLlmProviderError("llm.provider_network_error", "connect ECONNREFUSED", true);

type Mode = "candidate" | "project";

async function build(mode: Mode, answer: (request: AutomationStudioLlmTaskRequest) => Promise<unknown>) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const dataDir = await mkdtemp(path.join(os.tmpdir(), `fluxiq-provider-silent-${mode}-`));
  const provider = mockProvider(async (request) => {
    requests.push(request);
    return await answer(request);
  });
  const service = new AutomationStudioService({
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: {
      domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true })
    }
  });
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const { project, flow } = await blankFixture(service);
  const generation = service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: mode });
  return { requests, generation };
}

/** What the chat answers for the failed build, as `conversations/commands/build.ts` reads it. */
function chatCause(diagnostic: Awaited<ReturnType<typeof rejectedGenerationDiagnostic>>): string {
  return automationStudioConversationCallCause("the build", { ok: false, error: `Flow Bootstrap generation failed (${diagnostic.code}).`, payload: { diagnostic } });
}

/** The whole ending a build whose every call timed out tells the person, by mode (t619). */
const SILENT_ENDING: Readonly<Record<Mode, string>> = {
  candidate: "The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out. "
    + "Nothing was built: no Flow was created or changed, and nothing on the page was changed. What the Flow should do is kept, so you can try again later, once the provider is answering.",
  project: "The build stopped because the AI model provider did not answer: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out. "
    + "Nothing was built: no Flow was created or changed. The build left no change on the site that it knows of. What the Flow should do is kept, so you can try again later, once the provider is answering."
};

describe.each<Mode>(["candidate", "project"])("a %s build whose model provider answers nothing", (mode) => {
  it("ends as the provider not answering, never as something the model wrote or the supervisor ended", async () => {
    const { requests, generation } = await build(mode, async () => { throw timedOut(); });

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    // Three unanswered decisions end the build at once.
    expect(requests).toHaveLength(3);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_unavailable");
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.issueCodes).toEqual(["llm.provider_timeout"]);
    expect(diagnostic.ending).toMatchObject({ kind: "provider_unavailable", notDone: [], tried: { rounds: 1, decisions: 3, tested: "not_tested" } });
    // The whole ending, pinned per mode: the candidate's own loop says the page; the project build says what its builders left, here nothing, before the advice (t621).
    const message = diagnostic.ending!.message;
    expect(message).toBe(SILENT_ENDING[mode]);
    // Every call failed before anything arrived, and the diagnostic says so (t619).
    expect(diagnostic.providerResponse).toBe("not_received");
    expect(diagnostic.providerInvocation).toBe("attempted");

    // The chat: Core's ending, never the stage's words, the supervisor's ending row, or the provider's own words.
    const cause = chatCause(diagnostic);
    expect(cause).toBe(`the build could not finish. ${message.replace(/\.$/u, "")}`);
    const said = JSON.stringify(seen);
    expect(said).not.toContain("what the model wrote");
    expect(said).not.toContain("The supervisor ended the build");
    expect(said).not.toContain("FluxIQ could not finish the Flow");
    expect(said).not.toContain(PROVIDER_WORDS);
    expect(cause).not.toContain(PROVIDER_WORDS);
    expect(seen.at(-1)).toMatchObject({ phase: "failed", label: "Build stopped: the AI model provider is not responding", final: true, detail: { status: "failed", text: message } });
  });

  it("says a reply was received when one arrived before the provider stopped answering", async () => {
    let calls = 0;
    const { requests, generation } = await build(mode, async () => {
      calls += 1;
      if (calls > 1) throw timedOut();
      return { response: { kind: "evidence_tool_decision", summary: "Look.", decision: { kind: "tool_call", callId: "look", toolId: "inspect", input: { at: 1 } } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } };
    });

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests).toHaveLength(4);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_unavailable");
    expect(diagnostic.providerResponse).toBe("received");
  });

  it("says the provider could not be reached when no request reached it", async () => {
    const { generation } = await build(mode, async () => { throw unreachable(); });

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(diagnostic.code).toBe("flow_bootstrap.provider_unavailable");
    expect(diagnostic.ending?.message).toMatch(/^The build stopped because the AI model provider could not be reached: 3 requests in a row got no answer\. Nothing was built/u);
    expect(diagnostic.ending?.message).not.toContain("ECONNREFUSED");
  });
});

/** The fixture instruction (`blankFixture`), which the supervisor's one part quotes. */
const TASK = "Create a deterministic Start to End Flow.";
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

/**
 * A supervisor whose replies all arrive: it plans one part, sends its brief,
 * and ends the build blocked; its builder only looks, so its brief comes back
 * short (as `service/project-build/tests/project-build-facade.test.ts`'s "ends").
 */
async function answeredThenEnded(request: AutomationStudioLlmTaskRequest, supervisor: { decisions: number }) {
  const loop = request.context.evidenceLoop!;
  if (!loop.tools.some((tool) => tool.toolId === "project.write_plan")) return decision({ kind: "tool_call", callId: `look-${loop.evidence.length}`, toolId: "inspect", input: { at: loop.evidence.length } });
  supervisor.decisions += 1;
  if (supervisor.decisions === 1) {
    return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
      subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
    } });
  }
  if (supervisor.decisions === 2) {
    return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [{ kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 }] } });
  }
  return decision({ kind: "complete", result: { ended: "blocked", reason: "Nothing on the page can do this." } });
}

describe("a project build whose supervisor's replies arrive and end it without a Flow", () => {
  // The brief's other half: `post_provider_validation_failed` still means a reply that did arrive.
  it("keeps post_provider_validation_failed and the supervisor's ending, with no provider ending", async () => {
    const supervisor = { decisions: 0 };
    const { requests, generation } = await build("project", async (request) => await answeredThenEnded(request, supervisor));

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests.length).toBeGreaterThan(3);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_blocked"] });
    expect(diagnostic.ending).toBeUndefined();
    expect(seen.some((event) => event.detail?.title === "FluxIQ could not finish the Flow.")).toBe(true);
    // t649: the chat cause carries the supervisor's own reason (`endedBecause`) after its ending.
    expect(chatCause(diagnostic)).toBe("the build failed: FluxIQ could not finish the Flow: nothing on the page can do this");
  });
});
