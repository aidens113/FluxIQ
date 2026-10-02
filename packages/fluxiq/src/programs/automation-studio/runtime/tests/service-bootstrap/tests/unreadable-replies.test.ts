// A build whose model replies arrive unreadable (t211), through the real
// `generateFlowBootstrapAdaptation`: one unreadable reply is asked again and the
// build carries on to a proposed Flow; replies that stay unreadable end the
// build with a message saying so and how many tries it took -- never the bare
// `flow_bootstrap.evidence_invalid_decision` a round used to end on.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, copyDataDirSeed, caller, isJudgeRequest, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const SEEDING_TIMEOUT_MS = 60_000;

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unreadable-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unreadable-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

/** What the DeepSeek adapter throws for a reply whose brackets did not match: the case and the paid usage, never the content. */
function malformed(): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned an invalid response envelope.", false, undefined, undefined, undefined, undefined,
    { case: "content_mismatched", finishReason: "stop", contentChars: 2_100, usage: { inputTokens: 100, outputTokens: 560, totalTokens: 660, estimatedCostUsd: 0.002 } });
}

/** A model whose replies are unreadable where `unreadable` says, and otherwise acts once, adds the step and finishes; the judge of its test says yes. */
async function build(unreadable: (call: number) => boolean) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let acted = false;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const provider = mockProvider(async (request) => {
    requests.push(request);
    if (isJudgeRequest(request)) return judgeReply();
    if (unreadable(requests.length)) throw malformed();
    const decision: JsonObject = acted
      ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
      : { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: 1 }, add: true };
    acted = true;
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: USAGE };
  });
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
    llmEvidenceRuntime: {
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
    }
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation };
}

describe("a Flow build whose model reply arrives unreadable", () => {
  it("asks again with a note of what could not be read, and the build carries on to a proposed Flow", async () => {
    // The first two replies are unreadable, then the model acts and finishes.
    const { requests, generation } = await build((call) => call <= 2);

    await expect(generation).resolves.toMatchObject({ status: "proposed" });
    // Two unreadable, the act, the completion, then the judge of the Flow's test.
    expect(requests).toHaveLength(5);
    expect(requests.map(isJudgeRequest)).toEqual([false, false, false, false, true]);
    const note = requests[2]!.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.decision_check")?.value;
    expect(note).toMatchObject({ code: "llm_evidence_loop.reply_unreadable", unreadable: { case: "content_mismatched" }, unreadableInARow: 2 });
  });

  it("ends, when the replies stay unreadable, with a message saying so and how many tries it took", async () => {
    const { requests, generation } = await build(() => true);

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests).toHaveLength(6);
    expect(diagnostic.code).toBe("flow_bootstrap.model_replies_unreadable");
    expect(diagnostic.code).not.toBe("flow_bootstrap.evidence_invalid_decision");
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.ending).toMatchObject({ kind: "replies_unreadable", tried: { rounds: 1, decisions: 6, stepsInFlow: 0 } });
    expect(diagnostic.ending?.message).toMatch(/^The build stopped because the model's replies could not be read: 6 in a row came back unreadable -- because its brackets did not match/u);
    expect(diagnostic.ending?.message).toContain("In all, 6 of 6 replies could not be read, over one live round; each was paid for and counted in the build's budget.");
    // Every unreadable reply was paid for, and the build's accounting says so.
    expect(diagnostic.accounting?.estimatedCostUsd).toBeCloseTo(0.012, 6);
  });
});
