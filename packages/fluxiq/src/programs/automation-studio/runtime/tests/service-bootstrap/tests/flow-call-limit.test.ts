// A build stops at the call count its Flow configures. Live run
// `run-munnq7vz-98c3481c` saved `llmExecutionSettings.maxCalls: 48`, the host's
// resolver declared no count, and the build ran 64 decisions, the loop's own
// backstop, because nothing read the Flow's setting. Driven through the real
// `generateFlowBootstrapAdaptation`, since the defect was wiring.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, copyDataDirSeed, mockProvider, rejectedGenerationDiagnostic, seedDataDir, type DataDirSeed } from "./fixtures.ts";

// The case needs a project holding a blank Flow and its active instruction. Writing it through the service costs about a second on an idle
// machine and several under load, inside each case's 15s budget, so it is written once
// per file from a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;

let tempRoot: string;
let seedRoot: string;
let single: DataDirSeed<Awaited<ReturnType<typeof blankFixture>>>;
const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-call-limit-seed-"));
  single = await seedDataDir(path.join(seedRoot, "single"), (instance) => blankFixture(instance));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-call-limit-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a Flow build under the Flow's configured call count", () => {
  it("makes exactly the configured number of decisions when the model never finishes", async () => {
    const configuredCalls = 5;
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      const iteration = request.context.evidenceLoop?.iteration ?? 0;
      // Always a new area, so the loop's no-progress guard never ends it first.
      const decision: JsonObject = { kind: "tool_call", callId: `call.${iteration}`, toolId: "inspect", input: { area: `area.${iteration}` } };
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    // What the host's session-key resolver returns since grants went: its defaults and no call count.
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    const { project, flow } = structuredClone(await copyDataDirSeed(single, tempRoot));
    const instance = new AutomationStudioService({
      dataDir: tempRoot,
      llmProviderResolver: (() => ({ provider, tokenLimits: { ...defaults.tokenLimits }, timeoutMs: defaults.timeoutMs, maxEstimatedCostUsd: defaults.maxEstimatedCostUsd, maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd })) as never,
      llmEvidenceRuntime: {
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [{ toolId: "inspect", description: "Inspect one area.", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async (input) => ({ area: String(input.value.area) })
      }
    });
    services.add(instance);
    await instance.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: {
          ...flow.metadata,
          llmExecutionSettings: { tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxCalls: configuredCalls, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, retryCount: 0 }
        }
      }
    });

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() }));

    // The Flow's own call count is a budget the whole build is held to: the build ends at it, said as that (t208).
    expect(diagnostic.code).toBe("flow_bootstrap.evidence_budget_exhausted");
    expect(diagnostic.ending).toMatchObject({ kind: "budget_exhausted", bound: "calls" });
    expect(requests).toHaveLength(configuredCalls);
    // The Flow's timeout sizes a request, not spending, so the resolver's default stays on every call.
    for (const request of requests) expect(request.timeoutMs).toBe(defaults.timeoutMs);
  });
});
