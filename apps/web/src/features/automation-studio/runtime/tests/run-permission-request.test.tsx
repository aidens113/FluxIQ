import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioActionPermissionGate } from "fluxiq/automation-studio";

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
import { RunPermissionRequest } from "../RunPermissionRequest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A request built by Core's own gate, the way a recovery raises one, and then
 * sent through JSON as it reaches the panel. The grant allowed
 * `modify_existing`; the exploration was about to press a control that would
 * also publish something and create something new.
 */
async function coreRequest(options: { stage?: "recovery" | "authoring"; granted?: string[] } = {}) {
  const gate = new AutomationStudioActionPermissionGate({
    permittedConsequences: options.granted ?? ["modify_existing"],
    stage: options.stage ?? "recovery",
    instructionIds: ["instruction.schedule"],
    instructed: [],
    now: () => 1_790_000_000_000,
    newRequestId: () => "permission-request:test-1"
  });
  gate.observe({ controls: ["Add to queue", "Save as draft"] });
  const verdict = await gate.checkFor({ kind: "exploration_step", id: "web.press", ref: "call-3" })({
    consequences: ["send_or_publish", "create_new", "modify_existing"],
    control: { name: "Add to queue", kind: "button" },
    verb: "press"
  });
  expect(verdict.permitted).toBe(false);
  return JSON.parse(JSON.stringify(gate.request)) as Record<string, any>;
}

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) =>
    candidate.findAll((node) => node.children.some((child) => child === text)).length > 0
  );
}

const flow = {
  flowId: "flow.schedule",
  name: "Schedule Flow",
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

function commands(overrides: Record<string, unknown> = {}) {
  let grants = 0;
  let runs = 0;
  return {
    loadReadiness: vi.fn(async () => ({ loading: false, instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" })),
    start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.queued" } } })),
    execute: vi.fn(async () => { runs += 1; return { ok: true, payload: { runtimeSession: { runId: `run.${runs}`, flowId: flow.flowId, status: "failed" } } }; }),
    cancel: vi.fn(async () => ({ ok: true })),
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: 3000 } } } })),
    issueLlmGrant: vi.fn(async () => { grants += 1; return { ok: true, payload: { grant: { grantId: `grant.${grants}` } } }; }),
    ...overrides
  } as any;
}

/** The first run's detail carries the request; every later run's carries none. */
function detailLoader(request: Record<string, any>) {
  return vi.fn(async (payload: { runId: string }) => ({
    ok: true,
    payload: { runDetail: { summary: { runId: payload.runId }, metadata: payload.runId === "run.1" ? { permissionRequest: request, llmGate: { permissions: { granted: request.authority.granted, instructed: [], lapsed: [] } } } : {} } }
  }));
}

async function mount(runtimeCommands: ReturnType<typeof commands>, loadRunDetail: ReturnType<typeof detailLoader>) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<FlowRunViewContent
      commands={runtimeCommands}
      flow={flow}
      loadRunDetail={loadRunDetail as any}
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

async function runExploreAndAdapt(renderer: ReactTestRenderer) {
  await act(async () => button(renderer, "Explore and adapt")!.props.onClick());
  await act(async () => button(renderer, "Run")!.props.onClick());
}

describe("RunPermissionRequest", () => {
  it("shows the request Core built: its sentence, what is missing, and what was already allowed", async () => {
    const request = await coreRequest();
    const onAllow = vi.fn();
    const onDismiss = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<RunPermissionRequest onAllow={onAllow} onDismiss={onDismiss} runDetail={{ metadata: { permissionRequest: request } }} />); });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(JSON.stringify(request.sentence).slice(1, -1));
    expect(request.sentence).toContain("\"Add to queue\"");
    expect(rendered).toContain("send or publish something that others will receive or see");
    expect(rendered).toContain("create something new that stays");
    expect(renderer.root.findByProps({ "aria-label": "Consequences requiring approval" }).findAllByType("li")).toHaveLength(2);
    expect(rendered).toContain("Already allowed for this run: change something that already exists.");

    await act(async () => button(renderer, "Allow and run again")!.props.onClick());
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onAllow.mock.calls[0]?.[0].missing).toEqual(["send_or_publish", "create_new"]);
    await act(async () => button(renderer, "Don't allow")!.props.onClick());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("shows nothing Core did not build, and nothing from the build stage", async () => {
    const request = await coreRequest();
    const authoring = await coreRequest({ stage: "authoring" });
    for (const runDetail of [
      undefined,
      { metadata: {} },
      { metadata: { permissionRequest: { ...request, extra: true } } },
      { metadata: { permissionRequest: { ...request, missing: ["modify_existing"] } } },
      { metadata: { permissionRequest: { ...request, control: { name: "<b>Add</b>", kind: "button" } } } },
      { metadata: { permissionRequest: authoring } }
    ]) {
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(<RunPermissionRequest onAllow={vi.fn()} onDismiss={vi.fn()} runDetail={runDetail} />); });
      expect(renderer.toJSON()).toBeNull();
      await act(async () => renderer.unmount());
    }
  });

  it("offers no Allow for a run that carried no grant, and says how to be asked again", async () => {
    const request = await coreRequest({ granted: [] });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<RunPermissionRequest onDismiss={vi.fn()} runDetail={{ metadata: { permissionRequest: request } }} />); });
    expect(button(renderer, "Allow and run again")).toBeUndefined();
    expect(button(renderer, "Don't allow")).toBeDefined();
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Explore and adapt");
    expect(rendered).not.toContain("Already allowed");
    await act(async () => renderer.unmount());
  });
});

describe("Runtime Debug permission request from a run", () => {
  it("runs Explore and adapt on an exact-purpose grant and shows the request its run detail carries", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands();
    const loadRunDetail = detailLoader(request);
    const renderer = await mount(runtimeCommands, loadRunDetail);
    await runExploreAndAdapt(renderer);

    expect(runtimeCommands.preflightLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "explore_and_adapt" }));
    expect(runtimeCommands.preflightLlm.mock.calls[0]?.[0]).not.toHaveProperty("permittedConsequences");
    expect(runtimeCommands.preflightLlm.mock.calls[0]?.[0]).not.toHaveProperty("maxCalls");
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).toMatchObject({ purpose: "explore_and_adapt", ttlMs: 300_000 });
    expect(runtimeCommands.issueLlmGrant.mock.calls[0]?.[0]).not.toHaveProperty("permittedConsequences");
    expect(runtimeCommands.execute).toHaveBeenCalledWith(expect.objectContaining({ runIntent: "explore_and_adapt", llmExecutionGrantId: "grant.1", adaptiveMode: "manual_approval" }));
    expect(runtimeCommands.start).not.toHaveBeenCalled();
    expect(loadRunDetail).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.1", compact: true });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("This run stopped to ask for permission.");
    expect(rendered).toContain(JSON.stringify(request.sentence).slice(1, -1));
    await act(async () => renderer.unmount());
  });

  it("allows exactly the missing classes, for the same run intent, and nothing more", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands();
    const renderer = await mount(runtimeCommands, detailLoader(request));
    await runExploreAndAdapt(renderer);
    await act(async () => button(renderer, "Allow and run again")!.props.onClick());

    expect(runtimeCommands.preflightLlm).toHaveBeenCalledTimes(2);
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(2);
    expect(runtimeCommands.preflightLlm.mock.calls[1]?.[0]).toMatchObject({ purpose: "explore_and_adapt", permittedConsequences: ["send_or_publish", "create_new"] });
    const grant = runtimeCommands.issueLlmGrant.mock.calls[1]?.[0];
    expect(grant).toMatchObject({ projectId: "project.one", flowId: flow.flowId, keyId: "key.deepseek", purpose: "explore_and_adapt" });
    expect(grant.permittedConsequences).toEqual(["send_or_publish", "create_new"]);
    expect(grant.permittedConsequences).not.toContain("modify_existing");
    expect(grant).not.toHaveProperty("maxCalls");
    expect(grant).not.toHaveProperty("authorizedExternalSideEffects");
    expect(runtimeCommands.execute).toHaveBeenCalledTimes(2);
    expect(runtimeCommands.execute).toHaveBeenLastCalledWith(expect.objectContaining({ runIntent: "explore_and_adapt", llmExecutionGrantId: "grant.2", adaptiveMode: "manual_approval" }));
    expect(runtimeCommands.execute).toHaveBeenLastCalledWith(expect.not.objectContaining({ runId: expect.anything(), permittedConsequences: expect.anything() }));
    // The second run asked for nothing, so the question is gone.
    expect(JSON.stringify(renderer.toJSON())).not.toContain("This run stopped to ask for permission.");
    await act(async () => renderer.unmount());
  });

  it("sends nothing when the person does not allow it", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands();
    const renderer = await mount(runtimeCommands, detailLoader(request));
    await runExploreAndAdapt(renderer);
    await act(async () => button(renderer, "Don't allow")!.props.onClick());

    expect(runtimeCommands.preflightLlm).toHaveBeenCalledTimes(1);
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(1);
    expect(runtimeCommands.execute).toHaveBeenCalledTimes(1);
    expect(runtimeCommands.start).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).not.toContain("This run stopped to ask for permission.");
    await act(async () => renderer.unmount());
  });

  it("refuses to allow once the run inputs have changed", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands();
    const renderer = await mount(runtimeCommands, detailLoader(request));
    await runExploreAndAdapt(renderer);
    const stepLimit = renderer.root.findAllByType("input").find((candidate) => candidate.props.type === "number")!;
    await act(async () => stepLimit.props.onChange({ target: { value: "12" } }));
    await act(async () => button(renderer, "Allow and run again")!.props.onClick());

    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(1);
    expect(runtimeCommands.execute).toHaveBeenCalledTimes(1);
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("The Flow or its run inputs changed since this run asked.");
    expect(rendered).not.toContain("This run stopped to ask for permission.");
    await act(async () => renderer.unmount());
  });

  it("keeps the allowed classes through a high-token confirmation", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands({
      preflightLlm: vi.fn(async (payload: Record<string, unknown>) => ({ ok: true, payload: { preflight: { tokenLimits: { maxTotalTokens: payload.permittedConsequences ? 100_001 : 3000 } } } }))
    });
    const renderer = await mount(runtimeCommands, detailLoader(request));
    await runExploreAndAdapt(renderer);
    await act(async () => button(renderer, "Allow and run again")!.props.onClick());
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("more than 100,000 tokens");

    await act(async () => button(renderer, "Continue high-token execution")!.props.onClick());
    expect(runtimeCommands.issueLlmGrant).toHaveBeenCalledTimes(2);
    expect(runtimeCommands.issueLlmGrant.mock.calls[1]?.[0]).toMatchObject({ highTokenConfirmation: true, purpose: "explore_and_adapt", permittedConsequences: ["send_or_publish", "create_new"] });
    expect(runtimeCommands.execute).toHaveBeenLastCalledWith(expect.objectContaining({ runIntent: "explore_and_adapt", llmExecutionGrantId: "grant.2" }));
    await act(async () => renderer.unmount());
  });

  it("shows a request from a run without a grant, but offers no grant to widen", async () => {
    const request = await coreRequest({ granted: [] });
    const runtimeCommands = commands({
      start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.1" } } })),
      execute: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.1", flowId: flow.flowId, status: "failed" } } }))
    });
    const renderer = await mount(runtimeCommands, detailLoader(request));
    await act(async () => button(renderer, "Run")!.props.onClick());

    expect(runtimeCommands.start).toHaveBeenCalledTimes(1);
    expect(runtimeCommands.issueLlmGrant).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("This run stopped to ask for permission.");
    expect(button(renderer, "Allow and run again")).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});

describe("Runtime Debug run whose request was cut short", () => {
  it("names an explicit run and reads it back by that name, so its request still reaches the person", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands({ execute: vi.fn(async () => ({ ok: false, status: 408, code: "request_timeout", error: "Program request timed out." })) });
    const loadRunDetail = vi.fn(async (payload: { runId: string }) => ({
      ok: true,
      payload: { runDetail: { summary: { runId: payload.runId, flowId: flow.flowId, status: "failed", interventionCount: 2 }, adaptationIds: [], metadata: { permissionRequest: request } } }
    }));
    const renderer = await mount(runtimeCommands, loadRunDetail as any);
    await runExploreAndAdapt(renderer);
    const newRunId = runtimeCommands.execute.mock.calls[0]?.[0].newRunId;
    expect(newRunId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(runtimeCommands.execute.mock.calls[0]?.[0]).not.toHaveProperty("runId");

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_300)); });
    expect(loadRunDetail).toHaveBeenCalledWith({ projectId: "project.one", runId: newRunId, compact: true });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain(newRunId);
    expect(rendered).toContain("This run stopped to ask for permission.");
    expect(rendered).not.toContain("could not be completed");

    await act(async () => button(renderer, "Allow and run again")!.props.onClick());
    expect(runtimeCommands.issueLlmGrant.mock.calls[1]?.[0].permittedConsequences).toEqual(["send_or_publish", "create_new"]);
    expect(runtimeCommands.execute.mock.calls[1]?.[0]).toMatchObject({ runIntent: "explore_and_adapt", llmExecutionGrantId: "grant.2" });
    expect(runtimeCommands.execute.mock.calls[1]?.[0].newRunId).not.toBe(newRunId);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_300)); });
    await act(async () => renderer.unmount());
  }, 15_000);

  it("reports any other failure at once and reads nothing back", async () => {
    const request = await coreRequest();
    const runtimeCommands = commands({ execute: vi.fn(async () => ({ ok: false, status: 400, error: "private-run-error" })) });
    const loadRunDetail = detailLoader(request);
    const renderer = await mount(runtimeCommands, loadRunDetail);
    await runExploreAndAdapt(renderer);
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("The authorized LLM run could not be completed.");
    expect(rendered).not.toContain("private-run-error");
    expect(loadRunDetail).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
