// A build whose model provider stops answering, through the real
// `generateFlowBootstrapAdaptation`: three unanswered requests in a row end the
// build at once with a message saying the provider is not responding -- no
// second round, no "Thinking about the next step" left on screen -- and one
// unanswered request followed by an answer still carries on to a proposed Flow.
//
// Live run `run-muq05kas-058193f0` (2026-10-01, a DeepSeek outage): eight
// requests waited out their 45-second deadline one after another, the round
// stalled, the build explored again and began waiting a second time.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, copyDataDirSeed, caller, isJudgeRequest, judgeReply, mockProvider, plan, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const SEEDING_TIMEOUT_MS = 60_000;

let tempRoot: string;
let seedRoot: string;
let example: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unavailable-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-unavailable-"));
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});

afterEach(async () => {
  unsubscribe();
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

const USAGE = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

/** What the DeepSeek adapter throws when its own deadline passes with no answer. */
const timedOut = () => new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not respond before the request timeout.", true);

/** A provider that gives no answer where `silent` says, and otherwise acts once, adds the step and finishes; the judge of its test says yes. */
async function build(silent: (call: number) => boolean) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let acted = false;
  const { project, flow } = structuredClone(await copyDataDirSeed(example, tempRoot));
  const provider = mockProvider(async (request) => {
    requests.push(request);
    if (isJudgeRequest(request)) return judgeReply();
    if (silent(requests.length)) throw timedOut();
    const decision: JsonObject = acted
      ? { kind: "complete", result: { summary: "Built.", plan: plan() } }
      : { kind: "tool_call", callId: `call.${requests.length}`, toolId: "example.act", input: { press: 1 }, add: true };
    acted = true;
    return { response: { kind: "evidence_tool_decision", summary: "Step.", decision }, usage: USAGE };
  });
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding({
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }],
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { changed: input.callId }, effectApplied: true, resultCode: "example.acted" })
    })
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
  return { requests, generation };
}

describe("a Flow build whose model provider stops answering", () => {
  it("ends after three unanswered requests, once, saying the provider is not responding and that nothing was changed", async () => {
    const { requests, generation } = await build(() => true);

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    // Three requests, one round: never the eight-and-a-second-round of the outage.
    expect(requests).toHaveLength(3);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_unavailable");
    expect(diagnostic.retryable).toBe(true);
    expect(diagnostic.ending).toMatchObject({ kind: "provider_unavailable", tried: { rounds: 1, decisions: 3, stepsInFlow: 0, tested: "not_tested" } });
    expect(diagnostic.ending?.message).toMatch(/^The build stopped because the AI model provider is not responding: 3 requests in a row got no answer -- it did not answer before the time allowed for each request ran out\. No Flow was created or changed, and nothing on the page was changed\./u);
    expect(diagnostic.ending?.message).toContain("Try again once the provider is answering.");

    // The chat: each unanswered request said in words, and the build's own ending last, final, with the message.
    const unansweredRows = seen.filter((event) => event.label === "The AI model provider did not answer");
    expect(unansweredRows).toHaveLength(3);
    expect(unansweredRows.every((event) => event.detail?.status === "failed")).toBe(true);
    const last = seen.at(-1)!;
    expect(last).toMatchObject({ phase: "failed", label: "Build stopped: the AI model provider is not responding", final: true, detail: { status: "failed", text: diagnostic.ending?.message } });
    // Nothing after the ending, and every "Deciding the next step" closed.
    // What the person asked is on the build's activity in their own words, for the chat to show as theirs.
    expect(seen.filter((event) => event.request !== undefined).map((event) => event.request)).toEqual(["Create a deterministic Start to End Flow."]);
    const decided = seen.filter((event) => event.detail?.title === "Deciding the next step");
    expect(decided.filter((event) => event.detail?.status === "started")).toHaveLength(3);
    expect(decided.filter((event) => event.detail?.status === "failed")).toHaveLength(3);
  });

  it("says what was already done on the page when the provider stops after the build acted", async () => {
    const { requests, generation } = await build((call) => call > 1);

    const diagnostic = await rejectedGenerationDiagnostic(generation);

    expect(requests).toHaveLength(4);
    expect(diagnostic.code).toBe("flow_bootstrap.provider_unavailable");
    expect(diagnostic.ending?.message).toContain("No Flow was created or changed. The one action already taken on the page was not undone.");
  });

  it("carries on to a proposed Flow when an unanswered request is followed by an answer", async () => {
    const { requests, generation } = await build((call) => call === 1 || call === 3);

    await expect(generation).resolves.toMatchObject({ status: "proposed" });
    // Unanswered, the act, unanswered, the completion, then the judge of the Flow's test.
    expect(requests).toHaveLength(5);
    expect(requests.map(isJudgeRequest)).toEqual([false, false, false, false, true]);
  });
});
