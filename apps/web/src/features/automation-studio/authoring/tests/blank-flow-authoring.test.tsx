import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { BlankFlowAuthoringPanel } from "../BlankFlowAuthoringPanel";
import { AUTOMATION_LLM_PROGRESS_LABELS, blankFlowAuthoringRequest, blankFlowAuthoringRequestPolicy, blankFlowExplorationRequest, WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } from "../blank-flow-authoring-model";
import { generateFlowBootstrapAdaptation, generateFlowFromWebsiteExplorationAdaptation, saveFlowGenerationInstruction, WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } from "../authoring-commands";

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
    llmModel: "deepseek-flash",
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
// A build names only the Flow: nothing is preflighted, issued or confirmed first.
const buildPayload = { projectId: "project.one", flowId: "flow.blank" };
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
  it("offers a build for a blank Flow with a model key, naming only the Flow", () => {
    expect(blankFlowAuthoringRequest("project.one", flow, readiness)).toEqual({ ok: true, payload: buildPayload });
    expect(blankFlowAuthoringRequest("project.one", { ...flow, nodes: [{ id: "start" }] }, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, instructions: [] }).ok).toBe(false);
    expect(blankFlowExplorationRequest("project.one", flow, { ...readiness, instructions: [] })).toEqual({ ok: true, payload: buildPayload });
    expect(blankFlowExplorationRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: undefined } }, { ...readiness, instructions: [] }).ok).toBe(true);
    // Saved per-call limits no longer gate a build: nothing compares them before the call.
    expect(blankFlowAuthoringRequest("project.one", explorationFlow, readiness)).toEqual({ ok: true, payload: buildPayload });
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: undefined } }, readiness).ok).toBe(true);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, subflowTotal: 1 }).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmSecretKeyId: "" } }, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequestPolicy).toEqual({
      generation: { endpoint: "generate-flow-bootstrap-adaptation", intent: "mutation" }
    });
    expect(AUTOMATION_LLM_PROGRESS_LABELS).toEqual({ checkingPriorEvidence: "Checking prior evidence", inspectingLiveTarget: "Inspecting live target", generatingProposal: "Generating proposal", readyForReview: "Ready for review" });
  });

  it("builds on one press, with no preflight, grant or confirmation step", async () => {
    const authoringCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(authoringCommands);
    await act(async () => button(renderer, "Build proposal from active instructions")!.props.onClick());
    expect(authoringCommands.generateBootstrap).toHaveBeenCalledTimes(1);
    expect(authoringCommands.generateBootstrap).toHaveBeenCalledWith(buildPayload);
    expect(authoringCommands.generateBootstrap.mock.calls[0]?.[0]).not.toHaveProperty("llmExecutionGrantId");
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.bootstrap.one");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Account password");
    expect(JSON.stringify(renderer.toJSON())).not.toMatch(/Security PIN|>PIN</u);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("100,000 tokens");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Use prior sanitized evidence");
    expect(JSON.stringify(renderer.toJSON())).not.toContain(AUTOMATION_LLM_PROGRESS_LABELS.checkingPriorEvidence);
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
    await generateFlowBootstrapAdaptation({ post } as any, { projectId: "project.one", flowId: "flow.blank" });
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank" });
    await saveFlowGenerationInstruction({ post } as any, { projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout" });
    expect(post).toHaveBeenCalledWith("save-flow-generation-instruction", { projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout" });
    await generateFlowFromWebsiteExplorationAdaptation({ post } as any, { projectId: "project.one", flowId: "flow.blank", permittedConsequences: ["modify_existing"] });
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank", permittedConsequences: ["modify_existing"], evidenceGuided: true }, { policy: { timeoutMs: 675_000 } });
  });

  it("waits longer than an exploration can run before giving up on its answer", () => {
    expect(WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS).toBe(WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS);
    expect(WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS).toBe(675_000);
  });

  it("saves a bounded task before website exploration and opens review", async () => {
    const authoringCommands = commands();
    const onOpenAdaptation = vi.fn();
    const { renderer } = await mount(authoringCommands, onOpenAdaptation, readiness, flow);
    const textarea = renderer.root.findByProps({ "aria-label": "Website task" });
    expect(textarea.props.maxLength).toBe(4_000);
    await act(async () => textarea.props.onChange({ target: { value: "  Complete checkout and capture the total.  " } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    expect(authoringCommands.saveGenerationInstruction).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", instruction: "Complete checkout and capture the total." });
    expect(authoringCommands.generateFromWebsite).toHaveBeenCalledWith(buildPayload);
    expect(authoringCommands.saveGenerationInstruction.mock.invocationCallOrder[0]).toBeLessThan(authoringCommands.generateFromWebsite.mock.invocationCallOrder[0]!);
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.exploration.one");
    expect(renderedText(renderer.toJSON())).toContain("Ready for review.");
    expect(JSON.stringify(renderer.toJSON())).toContain("No generated changes have been applied.");
    expect(JSON.stringify(authoringCommands.generateFromWebsite.mock.calls)).not.toContain("authorizationPassword");
    await act(async () => renderer.unmount());
  });

  it("tells the user what bounds an exploration instead of promising a call count", async () => {
    const { renderer } = await mount(commands(), vi.fn(), { ...readiness, instructions: [] });
    const bounds = renderer.root.findAllByType("small").map((node) => renderedText(node)).find((text) => text.includes("spending limit"));
    expect(bounds).toBe("The model is asked as many times as the exploration needs. It stops when it has a proposal, when it stops making progress, or at the spending limit set for this automation, whichever comes first.");
    expect(renderedText(renderer.toJSON())).not.toMatch(/Up to \d+ model calls/u);
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

  it("says a build that ran out kept its draft, from Core's two counts and nothing else", async () => {
    const answer = (incompleteDraft: unknown) => vi.fn(async () => ({
      ok: false,
      payload: { diagnostic: { code: "flow_bootstrap.evidence_iteration_limit", evidenceLoop: { decisionCount: 34, incompleteDraft }, providerResponse: "private-provider-output" } }
    }));
    const run = async (incompleteDraft: unknown) => {
      const { renderer } = await mount(commands({ generateFromWebsite: answer(incompleteDraft) }));
      await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Complete checkout" } }));
      await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
      const rendered = JSON.stringify(renderer.toJSON());
      await act(async () => renderer.unmount());
      return rendered;
    };
    const kept = await run({ revision: 4, steps: 7 });
    expect(kept).toContain("Start closer to the target page");
    expect(kept).toContain("a draft of 7 steps (revision 4)");
    expect(kept).not.toContain("private-provider-output");
    expect(await run({ revision: 4, steps: "7 <script>" })).not.toContain("draft of");
    expect(await run(undefined)).not.toContain("draft of");
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

  it("retains an exact bound request across cancel, reopen, and equivalent revalidation, then permits only missing consequences", async () => {
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
    expect(generateFromWebsite).toHaveBeenCalledTimes(1);
    expect(generateFromWebsite.mock.calls[0]?.[0]).not.toHaveProperty("permittedConsequences");

    await act(async () => button(renderer, "Cancel")!.props.onClick());
    expect(generateFromWebsite).toHaveBeenCalledTimes(1);
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    expect(button(renderer, "Review requested permissions")).toBeDefined();

    await act(async () => renderer.update(<BlankFlowAuthoringPanel commands={authoringCommands} flow={{ ...flow, metadata: { ...flow.metadata } }} onOpenAdaptation={vi.fn()} projectId="project.one" readiness={{ ...readiness, instructions: [...readiness.instructions] }} />));
    await act(async () => button(renderer, "Review requested permissions")!.props.onClick());
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm Flow action consequences" })).toHaveLength(1);
    await act(async () => button(renderer, "Allow and continue")!.props.onClick());
    expect(generateFromWebsite).toHaveBeenLastCalledWith({ ...buildPayload, permittedConsequences: ["modify_existing"] });
    expect(generateFromWebsite.mock.calls[1]?.[0]).not.toHaveProperty("llmExecutionGrantId");
    expect(onOpenAdaptation).not.toHaveBeenCalled();
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
  ])("rejects a stale continuation when the %s changes while the task is being saved", async (_label, nextProjectId, nextFlow) => {
    const savedTask = { ok: true, payload: { instruction: { instructionId: "instruction.generation", status: "active" } } };
    let resolveContinuationSave!: (value: typeof savedTask) => void;
    const continuationSave = new Promise<typeof savedTask>((resolve) => { resolveContinuationSave = resolve; });
    const saveGenerationInstruction = vi.fn()
      .mockResolvedValueOnce(savedTask)
      .mockImplementationOnce(() => continuationSave)
      .mockResolvedValue(savedTask);
    const generateFromWebsite = vi.fn(async () => permissionFailure());
    const authoringCommands = commands({ saveGenerationInstruction, generateFromWebsite });
    const { renderer } = await mount(authoringCommands);
    await act(async () => renderer.root.findByProps({ "aria-label": "Website task" }).props.onChange({ target: { value: "Update the saved shipping address" } }));
    await act(async () => button(renderer, "Explore and create proposal")!.props.onClick());
    await act(async () => { button(renderer, "Allow and continue")!.props.onClick(); await Promise.resolve(); });
    expect(saveGenerationInstruction).toHaveBeenCalledTimes(2);

    await act(async () => renderer.update(<BlankFlowAuthoringPanel commands={authoringCommands} flow={nextFlow} onOpenAdaptation={vi.fn()} projectId={nextProjectId} readiness={readiness} />));
    await act(async () => { resolveContinuationSave(savedTask); await continuationSave; await Promise.resolve(); });

    expect(generateFromWebsite).toHaveBeenCalledTimes(1);
    expect(button(renderer, "Review requested permissions")).toBeUndefined();
    expect(renderedText(renderer.toJSON())).toContain("Start a new exploration before approving consequences");
    await act(async () => renderer.unmount());
  });

  it("offers exploration at once, with no availability check before it", async () => {
    const authoringCommands = commands();
    const { renderer } = await mount(authoringCommands);
    expect(button(renderer, "Explore and create proposal")).toBeDefined();
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Flow authoring is not available.");
    expect(button(renderer, "Retry availability check")).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});
