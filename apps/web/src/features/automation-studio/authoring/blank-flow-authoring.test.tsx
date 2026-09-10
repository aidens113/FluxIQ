import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { BlankFlowAuthoringPanel } from "./BlankFlowAuthoringPanel";
import { AUTOMATION_LLM_PROGRESS_LABELS, blankFlowAuthoringRequest, blankFlowAuthoringRequestPolicy, blankFlowExplorationRequest, BLANK_FLOW_AUTHORING_LIMITS, llmRequestRequiresHighTokenWarning, WEBSITE_EXPLORATION_LIMITS, WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } from "./blank-flow-authoring-model";
import { generateFlowBootstrapAdaptation, generateFlowFromWebsiteExplorationAdaptation, saveFlowGenerationInstruction, WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } from "./authoring-commands";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flow = {
  flowId: "flow.blank",
  name: "Blank Flow",
  nodes: [],
  edges: [],
  metadata: {
    flowRepresentationVersion: 1,
    flowRepresentationKind: "orchestration",
    llmProvider: "deepseek",
    llmModel: "deepseek-chat",
    llmSecretKeyId: "key.deepseek",
    llmExecutionSettings: {
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCalls: 1,
      timeoutMs: 20000,
      maxEstimatedCostUsd: 0.25,
      retryCount: 0
    }
  }
};
const readiness = { loading: false, instructions: [{ instructionId: "instruction.one", status: "active" }], router: null, subflowTotal: 0, error: "" };
const explorationFlow = { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { ...flow.metadata.llmExecutionSettings, tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 4 } } };

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.children.some((child) => child === text));
}
function renderedText(value: any): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  return value ? renderedText(value.children) : "";
}
function commands(overrides: Record<string, unknown> = {}) {
  return {
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { purpose: "build_and_adapt", tokenLimits: { maxTotalTokens: 5000 } } } })),
    issueLlmGrant: vi.fn(async () => ({ ok: true, payload: { grant: { grantId: "grant.build.one" } } })),
    generateBootstrap: vi.fn(async () => ({ ok: true, payload: { adaptation: { projectId: "project.one", flowId: flow.flowId, adaptationId: "adaptation.bootstrap.one", status: "proposed" } } })),
    saveGenerationInstruction: vi.fn(async () => ({ ok: true, payload: { instruction: { instructionId: "instruction.generation", status: "active" } } })),
    generateFromWebsite: vi.fn(async () => ({ ok: true, payload: { adaptation: { projectId: "project.one", flowId: flow.flowId, adaptationId: "adaptation.exploration.one", status: "proposed" } } })),
    ...overrides
  } as any;
}
async function mount(authoringCommands: ReturnType<typeof commands>, onOpenAdaptation = vi.fn(), authoringReadiness = readiness, authoringFlow: any = flow) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<BlankFlowAuthoringPanel commands={authoringCommands} flow={authoringFlow} onOpenAdaptation={onOpenAdaptation} projectId="project.one" readiness={authoringReadiness} />); });
  return { renderer, onOpenAdaptation };
}
describe("blank Flow instruction authoring", () => {
  it("keeps normal builds exact while deriving bounded exploration limits at request time", () => {
    expect(blankFlowAuthoringRequest("project.one", flow, readiness)).toEqual({ ok: true, payload: {
      purpose: "build_and_adapt", projectId: "project.one", flowId: "flow.blank", keyId: "key.deepseek", provider: "deepseek", model: "deepseek-chat",
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0
    } });
    expect(blankFlowAuthoringRequest("project.one", { ...flow, nodes: [{ id: "start" }] }, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, instructions: [] }).ok).toBe(false);
    expect(blankFlowExplorationRequest("project.one", flow, { ...readiness, instructions: [] })).toEqual({ ok: true, payload: expect.objectContaining({ tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 4, maxTotalEstimatedCostUsd: 1 }) });
    expect(blankFlowExplorationRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: undefined } }, { ...readiness, instructions: [] }).ok).toBe(true);
    expect(blankFlowAuthoringRequest("project.one", explorationFlow, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, subflowTotal: 1 }).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { ...flow.metadata.llmExecutionSettings, tokenLimits: { maxInputTokens: 3000, maxOutputTokens: 1000, maxTotalTokens: 4000 } } } }, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { ...flow.metadata.llmExecutionSettings, maxCalls: 2 } } }, readiness).ok).toBe(false);
    expect(BLANK_FLOW_AUTHORING_LIMITS).toMatchObject({ maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0 });
    expect(WEBSITE_EXPLORATION_LIMITS).toEqual({ tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 4, timeoutMs: 45_000, maxTotalEstimatedCostUsd: 1 });
    expect(blankFlowAuthoringRequestPolicy).toEqual({
      preflight: { endpoint: "preflight-llm-execution", intent: "mutation" },
      authorization: { endpoint: "issue-llm-execution-grant", intent: "mutation" },
      generation: { endpoint: "generate-flow-bootstrap-adaptation", intent: "mutation" }
    });
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 100_000 } } })).toBe(false);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 100_001 } } })).toBe(true);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 20_000 }, maxCalls: 6 } })).toBe(true);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 12_000 }, maxCalls: 4 } })).toBe(false);
    expect(AUTOMATION_LLM_PROGRESS_LABELS).toEqual({ checkingPriorEvidence: "Checking prior evidence", inspectingLiveTarget: "Inspecting live target", generatingProposal: "Generating proposal", readyForReview: "Ready for review" });
  });

  it("uses the authenticated session for a normal build without prompting for credentials", async () => {
    const authoringCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(authoringCommands);
    authoringCommands.preflightLlm.mockClear();
    await act(async () => button(renderer, "Build proposal from active instructions")!.props.onClick());
    expect(authoringCommands.preflightLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0 }));
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", maxUses: 1 }));
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("ttlMs");
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPassword");
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPin");
    expect(authoringCommands.generateBootstrap).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.build.one" });
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.bootstrap.one");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Account password");
    expect(JSON.stringify(renderer.toJSON())).not.toMatch(/Security PIN|>PIN</u);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Use prior sanitized evidence");
    expect(JSON.stringify(renderer.toJSON())).not.toContain(AUTOMATION_LLM_PROGRESS_LABELS.checkingPriorEvidence);
    await act(async () => renderer.unmount());
  });

  it("shows confirmation only above 100,000 tokens", async () => {
    const authoringCommands = commands({ preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 100_001 } } } })) });
    const { renderer } = await mount(authoringCommands);
    await act(async () => button(renderer, "Build proposal from active instructions")!.props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain("more than 100,000 tokens");
    expect(authoringCommands.issueLlmGrant).not.toHaveBeenCalled();
    await act(async () => button(renderer, "Continue high-token build")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ highTokenConfirmation: true, maxUses: 1 }));
    await act(async () => renderer.unmount());
  });

  it("sanitizes a failed generation response", async () => {
    const privateProviderError = "private-provider-error";
    const generateBootstrap = vi.fn(async () => ({ ok: false, error: privateProviderError }));
    const authoringCommands = commands({ generateBootstrap });
    const { renderer, onOpenAdaptation } = await mount(authoringCommands);
    await act(async () => button(renderer, "Build proposal from active instructions")!.props.onClick());
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Flow authoring did not create a reviewable proposal.");
    expect(rendered).not.toContain(privateProviderError);
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("uses the proposal-only browser endpoint", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    await generateFlowBootstrapAdaptation({ post } as any, { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.one" });
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.one" });
    await saveFlowGenerationInstruction({ post } as any, { projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout" });
    expect(post).toHaveBeenCalledWith("save-flow-generation-instruction", { projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout" });
    await generateFlowFromWebsiteExplorationAdaptation({ post } as any, { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.explore" });
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.explore", evidenceGuided: true }, { policy: { timeoutMs: 195_000 } });
    expect(WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS).toBe(WEBSITE_EXPLORATION_LIMITS.maxCalls * WEBSITE_EXPLORATION_LIMITS.timeoutMs + 15_000);
  });

  it("saves a bounded task before authorizing website exploration and opens review", async () => {
    const authoringCommands = commands();
    const onOpenAdaptation = vi.fn();
    const { renderer } = await mount(authoringCommands, onOpenAdaptation, readiness, flow);
    const textarea = renderer.root.findByProps({ "aria-label": "Website task" });
    expect(textarea.props.maxLength).toBe(4_000);
    await act(async () => textarea.props.onChange({ target: { value: "  Complete checkout and capture the total.  " } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    expect(authoringCommands.saveGenerationInstruction).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout and capture the total." });
    expect(authoringCommands.preflightLlm).toHaveBeenLastCalledWith(expect.objectContaining({ tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 4, timeoutMs: 45_000, maxTotalEstimatedCostUsd: 1 }));
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ maxCalls: 4, timeoutMs: 45_000, maxTotalEstimatedCostUsd: 1, maxUses: 4, ttlMs: WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS }));
    expect(authoringCommands.generateFromWebsite).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.build.one" });
    expect(authoringCommands.saveGenerationInstruction.mock.invocationCallOrder[0]).toBeLessThan(authoringCommands.preflightLlm.mock.invocationCallOrder.at(-1)!);
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.exploration.one");
    expect(renderedText(renderer.toJSON())).toContain("Ready for review.");
    expect(JSON.stringify(renderer.toJSON())).toContain("No generated changes have been applied.");
    expect(renderer.root.findAllByType("small").some((node) => node.children.join("").includes(`${WEBSITE_EXPLORATION_LIMITS.timeoutMs / 1_000} seconds per call`))).toBe(true);
    expect(JSON.stringify(authoringCommands.issueLlmGrant.mock.calls)).not.toContain("authorizationPassword");
    await act(async () => renderer.unmount());
  });

  it("offers website exploration before a Flow has an active instruction", async () => {
    const { renderer } = await mount(commands(), vi.fn(), { ...readiness, instructions: [] }, flow);
    expect(button(renderer, "Explore and create proposal")).toBeDefined();
    expect(button(renderer, "Build proposal from active instructions")).toBeUndefined();
    await act(async () => renderer.unmount());
  });

  it("shows accessible progress and a clear live-action versus proposal boundary", async () => {
    let finishExploration!: (value: unknown) => void;
    const generateFromWebsite = vi.fn(() => new Promise((resolve) => { finishExploration = resolve; }));
    const { renderer } = await mount(commands({ generateFromWebsite }));
    const textarea = renderer.root.findByProps({ "aria-label": "Website task" });
    await act(async () => textarea.props.onChange({ target: { value: "Complete checkout" } }));
    await act(async () => {
      button(renderer, "Explore and create proposal")!.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Browser actions happen on the connected website");
    expect(renderedText(renderer.toJSON())).toContain("Inspecting live target. Collecting bounded page evidence; generating proposal follows");
    expect(renderer.root.findByProps({ "aria-label": "Inspecting live target" }).type).toBe("progress");
    await act(async () => {
      finishExploration({ ok: true, payload: { adaptation: { flowId: "flow.blank", adaptationId: "adaptation.exploration.one", status: "proposed" } } });
      await Promise.resolve();
    });
    await act(async () => renderer.unmount());
  });

  it("turns safe diagnostic codes into actionable guidance without rendering provider details", async () => {
    const generateFromWebsite = vi.fn(async () => ({
      ok: false,
      error: "private-provider-error",
      payload: { diagnostic: { code: "flow_bootstrap.evidence_iteration_limit", providerResponse: "private-provider-output" } }
    }));
    const { renderer } = await mount(commands({ generateFromWebsite }));
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Complete checkout" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Start closer to the target page or make the website task more specific");
    expect(rendered).not.toContain("private-provider-error");
    expect(rendered).not.toContain("private-provider-output");
    await act(async () => renderer.unmount());
  });

  it("keeps availability status visible and lets the user retry a rejected preflight", async () => {
    const preflightLlm = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 5_000 } } } });
    const { renderer } = await mount(commands({ preflightLlm }));
    expect(JSON.stringify(renderer.toJSON())).toContain("Flow authoring is not available.");
    await act(async () => button(renderer, "Retry availability check")!.props.onClick());
    expect(button(renderer, "Explore and create proposal")).toBeDefined();
    await act(async () => renderer.unmount());
  });
});
