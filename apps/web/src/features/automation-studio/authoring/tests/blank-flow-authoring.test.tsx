import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { BlankFlowAuthoringPanel } from "../BlankFlowAuthoringPanel";
import { AUTOMATION_LLM_PROGRESS_LABELS, blankFlowAuthoringRequest, blankFlowAuthoringRequestPolicy, blankFlowExplorationRequest, BLANK_FLOW_AUTHORING_LIMITS, llmRequestRequiresHighTokenWarning, WEBSITE_EXPLORATION_LIMITS, WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } from "../blank-flow-authoring-model";
import { generateFlowBootstrapAdaptation, generateFlowFromWebsiteExplorationAdaptation, saveFlowGenerationInstruction, WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } from "../authoring-commands";
import { llmPreflightRunLimits } from "../llm-preflight-run-limits";

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

// What Core answers for an exploration that names no call count: its iterating
// default of 26 calls, with the whole-run token budget held to 100,000.
const defaultExplorationPreflight = { purpose: "build_and_adapt", tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 26, maxTotalTokensPerRun: 100_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1, timeoutMs: 45_000 };
const explorationPayload = {
  purpose: "build_and_adapt", projectId: "project.one", flowId: "flow.blank", keyId: "key.deepseek", provider: "deepseek", model: "deepseek-chat",
  tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxTotalTokensPerRun: 560_000, timeoutMs: 45_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1, providerRetryCount: 0
};
const actionPermissionRequest = {
  schemaVersion: "automation-studio.action-permission-request.v1",
  requestId: "permission.one",
  requestedAtMs: 1,
  action: { kind: "exploration_step", id: "web.enter_field", ref: "call.one", verb: "enter" },
  control: { name: "Shipping address", kind: "text field" },
  consequences: ["modify_existing"],
  missing: ["modify_existing"],
  reason: { stage: "authoring", instructionIds: ["instruction.generation"] },
  authority: { granted: [], instructed: [] },
  sentence: "The run needs approval to change something that already exists."
};

function permissionFailure(permissionRequest: unknown = actionPermissionRequest) {
  return { ok: false, payload: { diagnostic: { code: "flow_bootstrap.permission_required", permissionRequest } } };
}

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
    expect(blankFlowExplorationRequest("project.one", flow, { ...readiness, instructions: [] })).toEqual({ ok: true, payload: explorationPayload });
    expect(blankFlowExplorationRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: undefined } }, { ...readiness, instructions: [] }).ok).toBe(true);
    // A saved call count is not the exploration's: Core picks it, so none is sent whatever the Flow saved.
    expect(blankFlowExplorationRequest("project.one", explorationFlow, readiness)).toEqual({ ok: true, payload: explorationPayload });
    expect(blankFlowAuthoringRequest("project.one", explorationFlow, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, subflowTotal: 1 }).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { ...flow.metadata.llmExecutionSettings, tokenLimits: { maxInputTokens: 3000, maxOutputTokens: 1000, maxTotalTokens: 4000 } } } }, readiness).ok).toBe(false);
    expect(BLANK_FLOW_AUTHORING_LIMITS).toMatchObject({ maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0 });
    // No call count; a claim window Core accepts (1 s to 300 s); Core's 600 s run lease.
    expect(WEBSITE_EXPLORATION_LIMITS).toEqual({ tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxTotalTokensPerRun: 560_000, timeoutMs: 45_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1, providerRetryCount: 0, grantClaimWindowMs: 60_000, runLeaseMs: 600_000 });
    expect(WEBSITE_EXPLORATION_LIMITS).not.toHaveProperty("maxCalls");
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

  it("offers the single-call build whatever call count the Flow stored, and still matches every other saved limit exactly", async () => {
    const withExecution = (execution: Record<string, unknown> | undefined) => ({ ...flow, metadata: { ...flow.metadata, llmExecutionSettings: execution } });
    const { maxCalls: _storedCallCount, ...savedWithoutCallCount } = flow.metadata.llmExecutionSettings;
    const oneCall = blankFlowAuthoringRequest("project.one", flow, readiness);
    expect(oneCall.ok).toBe(true);
    // Flow Settings no longer offers a call count, so a Flow saved without one,
    // or with any other, still gets the build, and the build still asks for one call.
    for (const execution of [savedWithoutCallCount, { ...savedWithoutCallCount, maxCalls: 2 }, { ...savedWithoutCallCount, maxCalls: 8 }, { ...savedWithoutCallCount, maxCalls: 64 }]) {
      expect(blankFlowAuthoringRequest("project.one", withExecution(execution), readiness), JSON.stringify(execution)).toEqual(oneCall);
    }
    // Every other saved limit is still matched exactly.
    const mismatches: Array<Record<string, unknown>> = [
      { tokenLimits: { ...savedWithoutCallCount.tokenLimits, maxInputTokens: 3_999 } },
      { tokenLimits: { ...savedWithoutCallCount.tokenLimits, maxOutputTokens: 1_001 } },
      { tokenLimits: { ...savedWithoutCallCount.tokenLimits, maxTotalTokens: 5_001 } },
      { tokenLimits: undefined },
      { timeoutMs: 20_001 },
      { timeoutMs: undefined },
      { maxEstimatedCostUsd: 0.24 },
      { maxEstimatedCostUsd: undefined },
      { retryCount: 1 },
      { retryCount: undefined }
    ];
    for (const mismatch of mismatches) {
      expect(blankFlowAuthoringRequest("project.one", withExecution({ ...savedWithoutCallCount, ...mismatch }), readiness).ok, JSON.stringify(mismatch)).toBe(false);
    }
    expect(blankFlowAuthoringRequest("project.one", withExecution(undefined), readiness).ok).toBe(false);
    // The panel shows the build for a Flow saved without a call count, and asks Core for one call and one use.
    const authoringCommands = commands();
    const { renderer } = await mount(authoringCommands, vi.fn(), readiness, withExecution(savedWithoutCallCount));
    authoringCommands.preflightLlm.mockClear();
    const build = button(renderer, "Build proposal from active instructions");
    expect(build).toBeDefined();
    await act(async () => build!.props.onClick());
    expect(authoringCommands.preflightLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", maxCalls: 1 }));
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", maxCalls: 1, maxUses: 1 }));
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
    const rows = Object.fromEntries(renderer.root.findByProps({ "aria-label": "Flow build request limits" }).findAllByType("div").map((row) => [renderedText(row.findByType("dt")), renderedText(row.findByType("dd"))]));
    expect(rows).toEqual({
      "Input tokens per call": "4000",
      "Output tokens per call": "1000",
      "Total tokens per call": "5000",
      "Total tokens for the run": "Not reported",
      Calls: "1",
      "Timeout per call": "20 seconds",
      "Maximum total cost": "$0.25",
      "Provider retries": "0"
    });
    await act(async () => button(renderer, "Continue high-token build")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ highTokenConfirmation: true, maxUses: 1, maxCalls: 1 }));
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("ttlMs");
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
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.explore", evidenceGuided: true }, { policy: { timeoutMs: 675_000 } });
  });

  it("waits for the whole claimed run rather than a product of calls and per-call timeouts", () => {
    expect(WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS).toBe(WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS);
    expect(WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS).toBe(WEBSITE_EXPLORATION_LIMITS.grantClaimWindowMs + WEBSITE_EXPLORATION_LIMITS.runLeaseMs + 15_000);
    // Core's run lease (AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS) is 600 s; the browser must outwait it.
    expect(WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS).toBeGreaterThan(600_000);
    // The grant's TTL is a claim window, which Core caps at 300 s.
    expect(WEBSITE_EXPLORATION_LIMITS.grantClaimWindowMs).toBeGreaterThanOrEqual(1_000);
    expect(WEBSITE_EXPLORATION_LIMITS.grantClaimWindowMs).toBeLessThanOrEqual(300_000);
  });

  it("judges the high-token confirmation on the preflight's run budget, falling back to calls times tokens only without one", () => {
    // Core's default exploration: 26 calls x 12,000 would be 312,000, but the run budget is 100,000.
    expect(llmRequestRequiresHighTokenWarning({ preflight: defaultExplorationPreflight })).toBe(false);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { ...defaultExplorationPreflight, maxTotalTokensPerRun: 100_001 } })).toBe(true);
    expect(llmRequestRequiresHighTokenWarning({ ...defaultExplorationPreflight, maxTotalTokensPerRun: 40_000 })).toBe(false);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 100_001 }, maxCalls: 1, maxTotalTokensPerRun: 100_000 } })).toBe(true);
    expect(llmRequestRequiresHighTokenWarning({ preflight: { maxTotalTokensPerRun: 100_001 } })).toBe(true);
    // Absent: the old product decides.
    expect(llmRequestRequiresHighTokenWarning({ preflight: { tokenLimits: { maxTotalTokens: 12_000 }, maxCalls: 26 } })).toBe(true);
    // Present but unreadable: ask rather than guess.
    for (const unreadable of ["100000", 0, -1, 1.5, Number.NaN, null]) {
      expect(llmRequestRequiresHighTokenWarning({ preflight: { ...defaultExplorationPreflight, maxTotalTokensPerRun: unreadable } })).toBe(true);
    }
    for (const nothing of [undefined, null, [], "preflight", { preflight: {} }]) expect(llmRequestRequiresHighTokenWarning(nothing)).toBe(false);
    expect(llmPreflightRunLimits({ preflight: defaultExplorationPreflight })).toEqual({ perCallTotalTokens: 12_000, maxCalls: 26, runTokenBudget: 100_000 });
    expect(llmPreflightRunLimits({ preflight: { tokenLimits: { maxTotalTokens: 5_000 } } })).toEqual({ perCallTotalTokens: 5_000 });
    expect(llmPreflightRunLimits({ preflight: { maxTotalTokensPerRun: "100000" } })).toEqual({ runTokenBudget: "unreadable" });
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
    expect(authoringCommands.preflightLlm).toHaveBeenLastCalledWith(explorationPayload);
    // No call count and no uses: Core sizes an iterating grant. The TTL is the claim window, not the run.
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, ttlMs: 60_000 });
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("maxUses");
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("maxCalls");
    expect(authoringCommands.generateFromWebsite).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.build.one" });
    expect(authoringCommands.saveGenerationInstruction.mock.invocationCallOrder[0]).toBeLessThan(authoringCommands.preflightLlm.mock.invocationCallOrder.at(-1)!);
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.exploration.one");
    expect(renderedText(renderer.toJSON())).toContain("Ready for review.");
    expect(JSON.stringify(renderer.toJSON())).toContain("No generated changes have been applied.");
    expect(renderer.root.findAllByType("small").some((node) => node.children.join("").includes(`${WEBSITE_EXPLORATION_LIMITS.timeoutMs / 1_000} seconds per call`))).toBe(true);
    expect(JSON.stringify(authoringCommands.issueLlmGrant.mock.calls)).not.toContain("authorizationPassword");
    await act(async () => renderer.unmount());
  });

  it("tells the user what bounds an exploration instead of promising a call count", async () => {
    const preflightLlm = vi.fn(async () => ({ ok: true, payload: { preflight: defaultExplorationPreflight } }));
    const authoringCommands = commands({ preflightLlm });
    const { renderer } = await mount(authoringCommands, vi.fn(), { ...readiness, instructions: [] });
    const bounds = renderer.root.findAllByType("small").map((node) => renderedText(node)).find((text) => text.includes("seconds per call"));
    expect(bounds).toBe("The model is asked as many times as the exploration needs, at up to 45 seconds per call. It stops when it has a proposal or stops making progress, or at 100,000 tokens, $1.00 estimated cost, or 10 minutes, whichever comes first.");
    expect(renderedText(renderer.toJSON())).not.toMatch(/Up to \d+ model calls/u);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Complete checkout" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    // 26 calls at 12,000 tokens each, held to a 100,000-token run: no confirmation.
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm high-token Flow Build" })).toHaveLength(0);
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, ttlMs: 60_000 });
    await act(async () => renderer.unmount());
  });

  it("names the token budget generically when the preflight does not report one", async () => {
    const { renderer } = await mount(commands(), vi.fn(), { ...readiness, instructions: [] });
    const bounds = renderer.root.findAllByType("small").map((node) => renderedText(node)).find((text) => text.includes("seconds per call"));
    expect(bounds).toContain("or at its token budget, $1.00 estimated cost, or 10 minutes");
    await act(async () => renderer.unmount());
  });

  it("confirms a high-token exploration with the run's real bounds and still names no uses", async () => {
    const preflight = { ...defaultExplorationPreflight, maxCalls: 64, maxTotalTokensPerRun: 640_000 };
    const authoringCommands = commands({ preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight } })) });
    const { renderer } = await mount(authoringCommands, vi.fn(), { ...readiness, instructions: [] });
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Complete checkout" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).not.toHaveBeenCalled();
    const rows = Object.fromEntries(renderer.root.findByProps({ "aria-label": "Flow build request limits" }).findAllByType("div").map((row) => [renderedText(row.findByType("dt")), renderedText(row.findByType("dd"))]));
    expect(rows).toEqual({
      "Input tokens per call": "48000",
      "Output tokens per call": "8000",
      "Total tokens per call": "56000",
      "Total tokens for the run": "640,000",
      Calls: "As many as needed, at most 64",
      "Timeout per call": "45 seconds",
      "Time limit for the run": "10 minutes",
      "Maximum total cost": "$1.00",
      "Provider retries": "0"
    });
    await act(async () => button(renderer, "Continue high-token build")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, highTokenConfirmation: true, ttlMs: 60_000 });
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

  it("refuses malformed permission requests", async () => {
    const generateFromWebsite = vi.fn(async () => permissionFailure({ ...actionPermissionRequest, unexpected: true }));
    const authoringCommands = commands({ generateFromWebsite });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm Flow action consequences" })).toHaveLength(0);
    expect(renderedText(renderer.toJSON())).toContain("Website exploration did not create a Flow proposal");
    await act(async () => renderer.unmount());
  });

  it("retains an exact bound request across cancel, reopen, and equivalent revalidation, then grants only missing consequences", async () => {
    const generateFromWebsite = vi.fn()
      .mockResolvedValueOnce(permissionFailure())
      .mockResolvedValue({ ok: true, payload: { adaptation: { flowId: flow.flowId, adaptationId: "adaptation.after.permission", status: "proposed" } } });
    const authoringCommands = commands({ generateFromWebsite });
    const onOpenAdaptation = vi.fn();
    const { renderer } = await mount(authoringCommands, onOpenAdaptation);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm Flow action consequences" })).toHaveLength(1);
    expect(renderedText(renderer.toJSON())).toContain("change something that already exists");
    authoringCommands.issueLlmGrant.mockClear();

    await act(async () => button(renderer, "Cancel")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).not.toHaveBeenCalled();
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    expect(button(renderer, "Review requested permissions")).toBeDefined();

    await act(async () => renderer.update(<BlankFlowAuthoringPanel commands={authoringCommands} flow={{ ...flow, metadata: { ...flow.metadata } }} onOpenAdaptation={vi.fn()} projectId="project.one" readiness={{ ...readiness, instructions: [...readiness.instructions] }} />));
    await act(async () => button(renderer, "Review requested permissions")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm Flow action consequences" })).toHaveLength(1);
    await act(async () => button(renderer, "Allow and continue")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, permittedConsequences: ["modify_existing"], ttlMs: 60_000 });
    expect(authoringCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("highTokenConfirmation");
    await act(async () => renderer.unmount());
  });

  it.each([
    ["task", { projectId: "project.one", flow: { ...flow }, instruction: "Use a different address" }],
    ["project", { projectId: "project.two", flow: { ...flow }, instruction: null }],
    ["Flow", { projectId: "project.one", flow: { ...flow, flowId: "flow.other" }, instruction: null }]
  ])("clears a pending permission request when the %s changes", async (_label, change) => {
    const generateFromWebsite = vi.fn(async () => permissionFailure());
    const authoringCommands = commands({ generateFromWebsite });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    await act(async () => button(renderer, "Cancel")!.props.onClick());
    if (change.instruction) {
      await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: change.instruction } }));
    } else {
      await act(async () => renderer.update(<BlankFlowAuthoringPanel commands={authoringCommands} flow={change.flow} onOpenAdaptation={vi.fn()} projectId={change.projectId} readiness={readiness} />));
    }
    expect(button(renderer, "Review requested permissions")).toBeUndefined();
    await act(async () => renderer.unmount());
  });

  it.each([
    ["project", "project.two", { ...flow }],
    ["Flow", "project.one", { ...flow, flowId: "flow.other" }]
  ])("rejects a stale continuation when the %s changes during deferred preflight", async (_label, nextProjectId, nextFlow) => {
    const normalPreflight = { ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 5_000 } } } };
    const highPreflight = { ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 100_001 } } } };
    let resolveContinuationPreflight!: (value: typeof highPreflight) => void;
    const continuationPreflight = new Promise<typeof highPreflight>((resolve) => { resolveContinuationPreflight = resolve; });
    const preflightLlm = vi.fn()
      .mockResolvedValueOnce(normalPreflight)
      .mockResolvedValueOnce(normalPreflight)
      .mockImplementationOnce(() => continuationPreflight)
      .mockResolvedValue(normalPreflight);
    const authoringCommands = commands({ preflightLlm, generateFromWebsite: vi.fn(async () => permissionFailure()) });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    authoringCommands.issueLlmGrant.mockClear();
    await act(async () => { button(renderer, "Allow and continue")!.props.onClick(); await Promise.resolve(); });
    expect(preflightLlm).toHaveBeenCalledTimes(3);

    await act(async () => renderer.update(<BlankFlowAuthoringPanel commands={authoringCommands} flow={nextFlow} onOpenAdaptation={vi.fn()} projectId={nextProjectId} readiness={readiness} />));
    await act(async () => { resolveContinuationPreflight(highPreflight); await continuationPreflight; await Promise.resolve(); });

    expect(renderer.root.findAllByProps({ "aria-label": "Confirm high-token Flow Build" })).toHaveLength(0);
    expect(authoringCommands.issueLlmGrant).not.toHaveBeenCalled();
    expect(button(renderer, "Review requested permissions")).toBeUndefined();
    expect(renderedText(renderer.toJSON())).toContain("Start a new exploration before approving consequences");
    await act(async () => renderer.unmount());
  });

  it("retains truthful high-token confirmation on a permission continuation", async () => {
    const highPreflight = { ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 100_001 } } } };
    const preflightLlm = vi.fn(async () => highPreflight);
    const generateFromWebsite = vi.fn()
      .mockResolvedValueOnce(permissionFailure())
      .mockResolvedValue({ ok: true, payload: { adaptation: { flowId: flow.flowId, adaptationId: "adaptation.after.permission", status: "proposed" } } });
    const authoringCommands = commands({ preflightLlm, generateFromWebsite });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    await act(async () => button(renderer, "Continue high-token build")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm Flow action consequences" })).toHaveLength(1);
    authoringCommands.issueLlmGrant.mockClear();
    await act(async () => button(renderer, "Allow and continue")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, highTokenConfirmation: true, permittedConsequences: ["modify_existing"], ttlMs: 60_000 });
    await act(async () => renderer.unmount());
  });

  it("retains the permission request while a continuation newly requires high-token confirmation", async () => {
    const normalPreflight = { ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 5_000 } } } };
    const highPreflight = { ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 100_001 } } } };
    const preflightLlm = vi.fn()
      .mockResolvedValueOnce(normalPreflight)
      .mockResolvedValueOnce(normalPreflight)
      .mockResolvedValueOnce(highPreflight)
      .mockResolvedValue(highPreflight);
    const generateFromWebsite = vi.fn(async () => permissionFailure());
    const authoringCommands = commands({ preflightLlm, generateFromWebsite });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    authoringCommands.issueLlmGrant.mockClear();
    await act(async () => button(renderer, "Allow and continue")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm high-token Flow Build" })).toHaveLength(1);
    expect(authoringCommands.issueLlmGrant).not.toHaveBeenCalled();
    await act(async () => button(renderer, "Continue high-token build")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith({ ...explorationPayload, highTokenConfirmation: true, permittedConsequences: ["modify_existing"], ttlMs: 60_000 });
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
