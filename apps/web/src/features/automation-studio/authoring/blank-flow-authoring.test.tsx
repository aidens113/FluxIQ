import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { BlankFlowAuthoringPanel } from "./BlankFlowAuthoringPanel";
import { blankFlowAuthoringRequest, blankFlowAuthoringRequestPolicy, BLANK_FLOW_AUTHORING_LIMITS } from "./blank-flow-authoring-model";
import { generateFlowBootstrapAdaptation } from "./authoring-commands";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const password = "authoring-password-value";
const pin = "7391";
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
      tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 },
      maxCalls: 1,
      timeoutMs: 20000,
      maxEstimatedCostUsd: 0.25,
      retryCount: 0
    }
  }
};
const readiness = { loading: false, instructions: [{ instructionId: "instruction.one", status: "active" }], router: null, subflowTotal: 0, error: "" };

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.children.some((child) => child === text));
}
function input(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("input").find((candidate) => candidate.props["aria-label"] === label);
}
function commands(overrides: Record<string, unknown> = {}) {
  return {
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { purpose: "build_and_adapt" } } })),
    issueLlmGrant: vi.fn(async () => ({ ok: true, payload: { grant: { grantId: "grant.build.one" } } })),
    generateBootstrap: vi.fn(async () => ({ ok: true, payload: { adaptation: { projectId: "project.one", flowId: flow.flowId, adaptationId: "adaptation.bootstrap.one", status: "proposed" } } })),
    ...overrides
  } as any;
}
async function mount(authoringCommands: ReturnType<typeof commands>, onOpenAdaptation = vi.fn()) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<BlankFlowAuthoringPanel commands={authoringCommands} flow={flow} onOpenAdaptation={onOpenAdaptation} projectId="project.one" readiness={readiness} />); });
  return { renderer, onOpenAdaptation };
}
async function openAndFill(renderer: ReactTestRenderer) {
  await act(async () => button(renderer, "Build Flow from instructions")!.props.onClick());
  await act(async () => input(renderer, "Account password")!.props.onChange({ target: { value: password } }));
  await act(async () => input(renderer, "Security PIN")!.props.onChange({ target: { value: pin } }));
}

function serializedCalls(mock: ReturnType<typeof vi.fn>): string { return JSON.stringify(mock.mock.calls); }

describe("blank Flow instruction authoring", () => {
  it("exposes only an exact blank, instructed, strictly bounded DeepSeek request", () => {
    expect(blankFlowAuthoringRequest("project.one", flow, readiness)).toEqual({ ok: true, payload: {
      purpose: "build_and_adapt", projectId: "project.one", flowId: "flow.blank", keyId: "key.deepseek", provider: "deepseek", model: "deepseek-chat",
      tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0
    } });
    expect(blankFlowAuthoringRequest("project.one", { ...flow, nodes: [{ id: "start" }] }, readiness).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, instructions: [] }).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", flow, { ...readiness, subflowTotal: 1 }).ok).toBe(false);
    expect(blankFlowAuthoringRequest("project.one", { ...flow, metadata: { ...flow.metadata, llmExecutionSettings: { ...flow.metadata.llmExecutionSettings, maxCalls: 2 } } }, readiness).ok).toBe(false);
    expect(BLANK_FLOW_AUTHORING_LIMITS).toMatchObject({ maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0 });
    expect(blankFlowAuthoringRequestPolicy).toEqual({
      preflight: { endpoint: "preflight-llm-execution", intent: "mutation" },
      authorization: { endpoint: "issue-llm-execution-grant", intent: "mutation" },
      generation: { endpoint: "generate-flow-bootstrap-adaptation", intent: "mutation" }
    });
  });

  it("authorizes one build, creates only a proposed adaptation, opens review, and clears credentials", async () => {
    const authoringCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(authoringCommands);
    expect(authoringCommands.preflightLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, providerRetryCount: 0 }));
    await openAndFill(renderer);
    const modal = JSON.stringify(renderer.toJSON());
    for (const text of ["2000", "512", "3000", "20 seconds", "$0.25", "Provider retries"]) expect(modal).toContain(text);
    await act(async () => button(renderer, "Authorize One Build")!.props.onClick());
    expect(authoringCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", authorizationPassword: password, authorizationPin: pin, maxUses: 1 }));
    expect(authoringCommands.generateBootstrap).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.build.one" });
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.blank", "adaptation.bootstrap.one");
    await act(async () => button(renderer, "Build Flow from instructions")!.props.onClick());
    expect(input(renderer, "Account password")!.props.value).toBe("");
    expect(input(renderer, "Security PIN")!.props.value).toBe("");
    for (const mock of [authoringCommands.preflightLlm, authoringCommands.generateBootstrap]) {
      expect(serializedCalls(mock)).not.toContain(password);
      expect(serializedCalls(mock)).not.toContain(pin);
    }
    await act(async () => renderer.unmount());
  });

  it("clears credentials and sanitizes a failed generation response", async () => {
    const generateBootstrap = vi.fn(async () => ({ ok: false, error: password + pin }));
    const authoringCommands = commands({ generateBootstrap });
    const { renderer, onOpenAdaptation } = await mount(authoringCommands);
    await openAndFill(renderer);
    await act(async () => button(renderer, "Authorize One Build")!.props.onClick());
    expect(input(renderer, "Account password")!.props.value).toBe("");
    expect(input(renderer, "Security PIN")!.props.value).toBe("");
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Flow authoring could not create a reviewable adaptation.");
    expect(rendered).not.toContain(password);
    expect(rendered).not.toContain(pin);
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("uses the proposal-only browser endpoint", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    await generateFlowBootstrapAdaptation({ post } as any, { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.one" });
    expect(post).toHaveBeenCalledWith("generate-flow-bootstrap-adaptation", { projectId: "project.one", flowId: "flow.blank", llmExecutionGrantId: "grant.one" });
  });
});
