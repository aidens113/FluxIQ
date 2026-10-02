// The decorator that puts a domain's instructions on every request, and the
// resolver wrapper the service stores, so no path to a provider leaves them out.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../harness-options/index.ts";
import { automationStudioLlmProviderWithDomainInstructions, automationStudioLlmResolverWithDomainInstructions } from "../index.ts";

const INSTRUCTIONS = { domainId: "web", version: "web.v1", text: "Handles name controls on the page you were last shown." };
const REQUEST = { requestId: "r1", taskKind: "runtime_diagnosis", context: {} } as unknown as AutomationStudioLlmTaskRequest;

function recordingProvider(): { provider: AutomationStudioLlmProvider; ran: AutomationStudioLlmTaskRequest[]; measured: AutomationStudioLlmTaskRequest[] } {
  const ran: AutomationStudioLlmTaskRequest[] = [];
  const measured: AutomationStudioLlmTaskRequest[] = [];
  return {
    ran,
    measured,
    provider: {
      metadata: { provider: "mock", model: "mock-1" },
      runTask: async (request, execution) => {
        ran.push(request);
        return { aborted: execution?.signal?.aborted ?? null };
      },
      measureInput: (request) => {
        measured.push(request);
        return { estimatedInputTokens: 10, estimatedInputBytes: 30 };
      },
      estimateCostUsd: (tokens) => tokens.inputTokens / 1_000
    }
  };
}

describe("automationStudioLlmProviderWithDomainInstructions", () => {
  it("stamps the instructions on every request run and measured, and leaves the caller's request alone", async () => {
    const { provider, ran, measured } = recordingProvider();
    const decorated = automationStudioLlmProviderWithDomainInstructions(provider, INSTRUCTIONS);

    const signal = new AbortController().signal;
    expect(await decorated.runTask(REQUEST, { signal })).toEqual({ aborted: false });
    await decorated.runTask({ ...REQUEST, requestId: "r2" });
    expect(decorated.measureInput?.(REQUEST)).toEqual({ estimatedInputTokens: 10, estimatedInputBytes: 30 });

    expect(ran.map((request) => request.domainInstructions)).toEqual([INSTRUCTIONS, INSTRUCTIONS]);
    expect(ran.map((request) => request.requestId)).toEqual(["r1", "r2"]);
    expect(measured[0]?.domainInstructions).toEqual(INSTRUCTIONS);
    expect(REQUEST.domainInstructions).toBeUndefined();
    expect(decorated.metadata).toBe(provider.metadata);
    expect(decorated.estimateCostUsd?.({ inputTokens: 2_000, outputTokens: 0 })).toBe(2);
  });

  it("does not invent a measure or a price the provider never had", () => {
    const bare: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "m" }, runTask: async () => ({}) };
    const decorated = automationStudioLlmProviderWithDomainInstructions(bare, INSTRUCTIONS);

    expect(decorated.measureInput).toBeUndefined();
    expect(decorated.estimateCostUsd).toBeUndefined();
  });

  it("returns the provider itself when there are no instructions", () => {
    const { provider } = recordingProvider();

    expect(automationStudioLlmProviderWithDomainInstructions(provider, undefined)).toBe(provider);
  });
});

describe("automationStudioLlmResolverWithDomainInstructions", () => {
  const binding = (systemInstructions?: { version: string; text: string }): AutomationStudioLlmEvidenceRuntimeBinding => ({
    domainId: "web",
    deniedEvidenceKeys: [],
    tools: [],
    executeTool: async () => ({}),
    ...(systemInstructions ? { systemInstructions } : {})
  });

  it("decorates a resolution's provider and keeps every other field", async () => {
    const { provider, ran } = recordingProvider();
    const resolver = automationStudioLlmResolverWithDomainInstructions((_input: { flowId: string }) => ({ provider, maxCallsPerRun: 3 }), () => binding({ version: "web.v1", text: INSTRUCTIONS.text }));

    const resolved = await resolver!({ flowId: "f" });
    await resolved.provider.runTask(REQUEST);

    expect(resolved.maxCallsPerRun).toBe(3);
    expect(ran[0]?.domainInstructions).toEqual(INSTRUCTIONS);
  });

  it("decorates a bare provider", async () => {
    const { provider, ran } = recordingProvider();
    const resolver = automationStudioLlmResolverWithDomainInstructions(async () => provider, () => binding({ version: "web.v1", text: INSTRUCTIONS.text }));

    await (await resolver!(undefined))!.runTask(REQUEST);

    expect(ran[0]?.domainInstructions).toEqual(INSTRUCTIONS);
  });

  it("reads the binding when a provider is resolved, so a runtime bound later is the one stamped", async () => {
    const { provider, ran } = recordingProvider();
    let bound: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
    const resolver = automationStudioLlmResolverWithDomainInstructions(() => ({ provider }), () => bound);

    expect((await resolver!(undefined)).provider).toBe(provider);
    bound = binding({ version: "web.v2", text: "Later rules." });
    await (await resolver!(undefined)).provider.runTask(REQUEST);

    expect(ran[0]?.domainInstructions).toEqual({ domainId: "web", version: "web.v2", text: "Later rules." });
  });

  it("returns a resolution untouched without instructions, and nothing for no resolver", async () => {
    const { provider } = recordingProvider();
    const resolution = { provider };
    const resolver = automationStudioLlmResolverWithDomainInstructions(() => resolution, () => binding());

    expect(await resolver!(undefined)).toBe(resolution);
    expect(await automationStudioLlmResolverWithDomainInstructions(() => undefined, () => binding({ version: "v1", text: "x" }))!(undefined)).toBeUndefined();
    expect(automationStudioLlmResolverWithDomainInstructions(undefined, () => binding())).toBeUndefined();
  });
});
