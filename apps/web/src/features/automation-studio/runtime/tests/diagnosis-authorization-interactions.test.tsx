import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../RunHistory", () => ({ RunHistory: () => null }));

vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return {
    ...actual,
    Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section>
  };
});

import { FlowRunViewContent } from "../FlowRunView";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

function commands(overrides: Record<string, unknown> = {}) {
  return {
    loadReadiness: vi.fn(async () => ({ loading: false, instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" })),
    start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.one" } } })),
    execute: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.one", status: "failed" } } })),
    cancel: vi.fn(async () => ({ ok: true })),
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 3000 } } } })),
    issueLlmGrant: vi.fn(async () => ({ ok: true, payload: { grant: { grantId: "grant.one" } } })),
    ...overrides
  } as any;
}

async function mount(runtimeCommands: ReturnType<typeof commands>, onOpenAdaptation = vi.fn()) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<FlowRunViewContent
      commands={runtimeCommands}
      flow={flow}
      models={[]}
      onOpenAdaptation={onOpenAdaptation}
      pipelineArtifacts={{ replayResults: [] }}
      policies={[]}
      projectId="project.one"
      runtimeSessions={[]}
      timelines={[]}
    />);
  });
  return renderer;
}

async function runDiagnosis(renderer: ReactTestRenderer) {
  await act(async () => button(renderer, "LLM diagnosis")!.props.onClick());
  await act(async () => button(renderer, "Run")!.props.onClick());
}

async function runAdaptation(renderer: ReactTestRenderer) {
  await act(async () => button(renderer, "Diagnose and propose adaptation")!.props.onClick());
  await act(async () => button(renderer, "Run")!.props.onClick());
}

describe("Runtime Debug mounted diagnosis authorization", () => {
  it("uses the authenticated session and scopes grant and intent to diagnosis_only", async () => {
    const runtimeCommands = commands();
    const renderer = await mount(runtimeCommands);
    await runDiagnosis(renderer);

    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({
      keyId: "key.deepseek",
      purpose: "diagnosis_only",
      maxCalls: 1,
      maxUses: 1
    }));
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPassword");
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPin");
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

    await act(async () => button(renderer, "No LLM intervention")!.props.onClick());
    await act(async () => button(renderer, "Run")!.props.onClick());
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(2, expect.not.objectContaining({
      runIntent: expect.anything(),
      llmExecutionGrantId: expect.anything()
    }));
    expect(runtimeCommands.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ runId: "run.one" }));
    expect(runtimeCommands.start).toHaveBeenCalledTimes(1);

    expect(JSON.stringify(renderer.toJSON())).not.toContain("Account password");
    expect(JSON.stringify(renderer.toJSON())).not.toMatch(/Security PIN|>PIN</u);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Use prior sanitized evidence");
    await act(async () => renderer.unmount());
  });

  it("issues a two-call exact-purpose grant and starts a fresh manual-review adaptation run", async () => {
    const runtimeCommands = commands({
      execute: vi.fn(async () => ({
        ok: true,
        payload: {
          runtimeSession: { runId: "run.adapt", flowId: flow.flowId, status: "failed" },
          runSummary: { flowId: flow.flowId },
          createdAdaptationIds: ["adaptation.target-fix"],
          durableBehaviorChanged: false
        }
      }))
    });
    const onOpenAdaptation = vi.fn();
    const renderer = await mount(runtimeCommands, onOpenAdaptation);
    await runAdaptation(renderer);

    expect(runtimeCommands.preflightLlm).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "diagnose_and_adapt",
      maxCalls: 2
    }));
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "diagnose_and_adapt",
      maxCalls: 2,
      maxUses: 2
    }));
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPassword");
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPin");
    expect(runtimeCommands.execute).toHaveBeenCalledWith(expect.objectContaining({
      runIntent: "diagnose_and_adapt",
      llmExecutionGrantId: "grant.one",
      adaptiveMode: "manual_approval"
    }));
    expect(runtimeCommands.execute).toHaveBeenCalledWith(expect.not.objectContaining({
      runId: expect.anything(),
      authorizedExternalSideEffects: expect.anything()
    }));
    expect(runtimeCommands.start).not.toHaveBeenCalled();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain("more than 100,000 tokens");
    expect(rendered).toContain("Ready for review");
    expect(rendered).toContain("Review adaptation.target-fix");
    expect(rendered).toContain('"Durable"');
    expect(rendered).toContain('"no"');
    const reviewAdaptation = renderer.root.findAllByType("button").find((candidate) => candidate.props["aria-label"] === "Review adaptation.target-fix");
    await act(async () => reviewAdaptation!.props.onClick());
    expect(onOpenAdaptation).toHaveBeenCalledWith(flow.flowId, "adaptation.target-fix");
    await act(async () => renderer.unmount());
  });

  it("shows the shared proposal phase while an authorized adaptation request is active", async () => {
    let finish!: (value: unknown) => void;
    const runtimeCommands = commands({ execute: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    const renderer = await mount(runtimeCommands);
    await act(async () => button(renderer, "Diagnose and propose adaptation")!.props.onClick());
    await act(async () => {
      button(renderer, "Run")!.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(button(renderer, "Generating proposal...")).toBeDefined();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).not.toContain("Checking prior evidence");
    expect(rendered).not.toContain("Use prior sanitized evidence");
    await act(async () => {
      finish({ ok: true, payload: { runtimeSession: { runId: "run.adapt", status: "failed" } } });
      await Promise.resolve();
    });
    await act(async () => renderer.unmount());
  });

  it.each([
    {
      name: "preflight rejection",
      overrides: { preflightLlm: vi.fn(async () => ({ ok: false, error: "private-preflight-error" })) },
      expectedError: "LLM execution preflight was rejected. Review the saved Flow limits and key selection.",
      issueCalls: 0
    },
    {
      name: "grant rejection",
      overrides: { issueLlmGrant: vi.fn(async () => ({ ok: false, error: "private-grant-error" })) },
      expectedError: "LLM execution authorization failed. Verify your session and enabled key.",
      issueCalls: 1
    }
  ])("renders only fixed errors after $name", async ({ overrides, expectedError, issueCalls }) => {
    const runtimeCommands = commands(overrides);
    const renderer = await mount(runtimeCommands);
    await runDiagnosis(renderer);

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(expectedError);
    expect(rendered).not.toContain("private-preflight-error");
    expect(rendered).not.toContain("private-grant-error");
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(issueCalls);
    expect(runtimeCommands.start).not.toHaveBeenCalled();
    expect(runtimeCommands.execute).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("asks for confirmation only above 100,000 tokens", async () => {
    const runtimeCommands = commands({ preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 100_001 } } } })) });
    const renderer = await mount(runtimeCommands);
    await runDiagnosis(renderer);
    expect(JSON.stringify(renderer.toJSON())).toContain("more than 100,000 tokens");
    expect(runtimeCommands.issueLlmGrant).not.toHaveBeenCalled();
    await act(async () => button(renderer, "Continue high-token execution")!.props.onClick());
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledWith(expect.objectContaining({ highTokenConfirmation: true, maxUses: 1 }));
    await act(async () => renderer.unmount());
  });
});
