import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("./RunHistory", () => ({ RunHistory: () => null }));

vi.mock("../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../programs/shared-ui")>();
  return {
    ...actual,
    Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
  };
});

import { FlowRunViewContent } from "./FlowRunView";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const password = "mounted-password-value";
const pin = "8642";
const flow = {
  flowId: "flow.diagnosis",
  name: "Diagnosis Flow",
  nodes: [{ id: "start" }],
  interface: { inputs: [] },
  metadata: {
    llmSecretKeyId: "key.deepseek",
    llmExecutionSettings: {
      tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 },
      maxCalls: 1,
      timeoutMs: 15000,
      maxEstimatedCostUsd: 0.1,
      retryCount: 0
    }
  }
};

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) =>
    candidate.findAll((node) => node.children.some((child) => child === text)).length > 0
  );
}

function passwordInput(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("input").find((input) => input.props.autoComplete === "current-password");
}

function pinInput(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("input").find((input) => input.props.inputMode === "numeric");
}

function commands(overrides: Record<string, unknown> = {}) {
  return {
    loadReadiness: vi.fn(async () => ({ loading: false, instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" })),
    start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.one" } } })),
    execute: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.one", status: "failed" } } })),
    cancel: vi.fn(async () => ({ ok: true })),
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: {} } })),
    issueLlmGrant: vi.fn(async () => ({ ok: true, payload: { grant: { grantId: "grant.one" } } })),
    ...overrides
  } as any;
}

async function mount(runtimeCommands: ReturnType<typeof commands>) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<FlowRunViewContent
      commands={runtimeCommands}
      flow={flow}
      models={[]}
      pipelineArtifacts={{ replayResults: [] }}
      policies={[]}
      projectId="project.one"
      runtimeSessions={[]}
      timelines={[]}
    />);
  });
  return renderer;
}

async function openAndFillAuthorization(renderer: ReactTestRenderer) {
  await act(async () => button(renderer, "LLM diagnosis")!.props.onClick());
  await act(async () => button(renderer, "Run")!.props.onClick());
  await act(async () => passwordInput(renderer)!.props.onChange({ target: { value: password } }));
  await act(async () => pinInput(renderer)!.props.onChange({ target: { value: pin } }));
}

function serializedCalls(mock: ReturnType<typeof vi.fn>): string {
  return JSON.stringify(mock.mock.calls);
}

describe("Runtime Debug mounted diagnosis authorization", () => {
  it("clears credentials after success and scopes grant and intent to diagnosis_only", async () => {
    const runtimeCommands = commands();
    const renderer = await mount(runtimeCommands);
    await openAndFillAuthorization(renderer);

    await act(async () => button(renderer, "Authorize One Diagnosis")!.props.onClick());

    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({
      authorizationPassword: password,
      authorizationPin: pin,
      keyId: "key.deepseek",
      maxUses: 1
    }));
    expect(runtimeCommands.preflightLlm).toHaveBeenCalledWith(expect.not.objectContaining({
      authorizationPassword: expect.anything(),
      authorizationPin: expect.anything()
    }));
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      runIntent: "diagnosis_only",
      llmExecutionGrantId: "grant.one",
      adaptiveMode: "manual_approval"
    }));
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ runId: expect.anything() }));
    expect(runtimeCommands.start).not.toHaveBeenCalled();

    await act(async () => button(renderer, "Run")!.props.onClick());
    expect(passwordInput(renderer)?.props.value).toBe("");
    expect(pinInput(renderer)?.props.value).toBe("");
    await act(async () => button(renderer, "Cancel")!.props.onClick());

    await act(async () => button(renderer, "No LLM intervention")!.props.onClick());
    await act(async () => button(renderer, "Run")!.props.onClick());
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(2, expect.not.objectContaining({
      runIntent: expect.anything(),
      llmExecutionGrantId: expect.anything()
    }));
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ runId: "run.one" }));
    expect(runtimeCommands.start).toHaveBeenCalledTimes(1);

    for (const callMock of [runtimeCommands.loadReadiness, runtimeCommands.preflightLlm, runtimeCommands.start, runtimeCommands.execute, runtimeCommands.cancel]) {
      expect(serializedCalls(callMock)).not.toContain(password);
      expect(serializedCalls(callMock)).not.toContain(pin);
    }
    await act(async () => renderer.unmount());
  });

  it.each([
    {
      name: "preflight rejection",
      overrides: { preflightLlm: vi.fn(async () => ({ ok: false, error: password + pin })) },
      expectedError: "LLM diagnosis preflight was rejected. Review the saved Flow limits and key selection.",
      issueCalls: 0
    },
    {
      name: "grant rejection",
      overrides: { issueLlmGrant: vi.fn(async () => ({ ok: false, error: password + pin })) },
      expectedError: "LLM diagnosis authorization failed. Verify your password, PIN, and enabled key.",
      issueCalls: 1
    }
  ])("clears controlled fields and renders only fixed errors after $name", async ({ overrides, expectedError, issueCalls }) => {
    const runtimeCommands = commands(overrides);
    const renderer = await mount(runtimeCommands);
    await openAndFillAuthorization(renderer);

    await act(async () => button(renderer, "Authorize One Diagnosis")!.props.onClick());

    expect(passwordInput(renderer)?.props.value).toBe("");
    expect(pinInput(renderer)?.props.value).toBe("");
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(expectedError);
    expect(rendered).not.toContain(password);
    expect(rendered).not.toContain(pin);
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(issueCalls);
    expect(runtimeCommands.start).not.toHaveBeenCalled();
    expect(runtimeCommands.execute).not.toHaveBeenCalled();
    expect(serializedCalls(runtimeCommands.preflightLlm)).not.toContain(password);
    expect(serializedCalls(runtimeCommands.preflightLlm)).not.toContain(pin);

    await act(async () => renderer.unmount());
  });
});