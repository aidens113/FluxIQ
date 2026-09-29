// The run panel's Pause, Take control and Continue (RunControlBar.tsx,
// useRunControl.ts, and their wiring in FlowRunView.tsx), against a fake Core
// that answers the way handlers/run-control.ts does.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../RunHistory", () => ({ RunHistory: () => null }));

import { FlowRunViewContent } from "../FlowRunView";
import { AutomationWorkspaceHeader } from "../../workspace/shell/WorkspaceHeader";
import { automationStudioActionSnapshot, invokeAutomationStudioRuntimeAction, resetAutomationStudioActionsForTests } from "../../workspace/studio-action-registry";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// The panel times a live run with `window.setInterval`; this suite runs in Node.
(globalThis as any).window ??= globalThis;
// The workspace header listens for its save shortcut on `window`.
(globalThis as any).addEventListener ??= () => undefined;
(globalThis as any).removeEventListener ??= () => undefined;

const flow = { flowId: "flow.sign-in", name: "Sign in and export", nodes: [{ id: "start" }], interface: { inputs: [] }, metadata: {} };

type Control = { state: "running" | "pause_requested" | "paused"; holder: "fluxiq" | "person" | null };

function fakeCore() {
  const control: Control = { state: "running", holder: null };
  let finish!: (value: unknown) => void;
  const answer = () => ({
    ok: true,
    payload: {
      runId: "run.live",
      sessionStatus: "running",
      live: true,
      runControl: { ...control, ...(control.state === "paused" ? { nodeId: "export" } : {}) },
      progress: control.state === "paused"
        ? control.holder === "person"
          ? { status: "user_action_required", label: "User action required", detail: "You have control of the page. Finish what you are doing in the browser, then select Continue." }
          : { status: "paused", label: "Paused", detail: "The run is held between steps. Resume it, or take control of the page." }
        : { status: "running", label: "Running" }
    }
  });
  const commands = {
    loadReadiness: vi.fn(async () => ({ loading: false, instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" })),
    start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.live" } } })),
    execute: vi.fn(() => new Promise((resolve) => { finish = resolve; })),
    cancel: vi.fn(async () => ({ ok: true })),
    preflightLlm: vi.fn(),
    issueLlmGrant: vi.fn(),
    readControl: vi.fn(async () => answer()),
    // The fake holds at once: the step in flight is Core's concern, not the panel's.
    pause: vi.fn(async (payload: { takeControl?: boolean }) => {
      control.state = "paused";
      control.holder = payload.takeControl ? "person" : control.holder ?? "fluxiq";
      return answer();
    }),
    resume: vi.fn(async () => { control.state = "running"; control.holder = null; return answer(); })
  };
  return { commands, finish: () => finish({ ok: true, payload: { runtimeSession: { runId: "run.live", flowId: flow.flowId, status: "succeeded" } } }) };
}

function text(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: any) => { if (typeof node === "string") parts.push(node); else if (node?.children) node.children.forEach(walk); };
  walk(renderer.toJSON() as any);
  return parts.join(" ");
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => node.type === "button" && node.props.children === label)[0];
}

async function startRun(core: ReturnType<typeof fakeCore>) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<FlowRunViewContent commands={core.commands as any} flow={flow} models={[]} pipelineArtifacts={{ replayResults: [] }} policies={[]} projectId="project.one" runtimeSessions={[]} timelines={[]} />);
  });
  await act(async () => { button(renderer, "Run")!.props.onClick(); });
  return renderer;
}

describe("pausing and taking over a run from the run panel", () => {
  const mounted: ReactTestRenderer[] = [];
  afterEach(() => { for (const renderer of mounted.splice(0)) act(() => renderer.unmount()); resetAutomationStudioActionsForTests(); });

  it("offers Pause while the run goes, and says Paused only once Core says so", async () => {
    const core = fakeCore();
    const renderer = await startRun(core);
    mounted.push(renderer);
    expect(core.commands.readControl).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live" });
    expect(button(renderer, "Pause")?.props.disabled).toBe(false);
    expect(automationStudioActionSnapshot().runtime?.canPause).toBe(true);

    await act(async () => { button(renderer, "Pause")!.props.onClick(); });
    expect(core.commands.pause).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live" });
    expect(text(renderer)).toContain("Paused");
    expect(button(renderer, "Resume")).toBeDefined();

    await act(async () => { button(renderer, "Resume")!.props.onClick(); });
    expect(core.commands.resume).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live" });
    expect(button(renderer, "Pause")).toBeDefined();
    await act(async () => { core.finish(); });
  });

  it("hands the page over on Take control, and records the manual action on Continue", async () => {
    const core = fakeCore();
    const renderer = await startRun(core);
    mounted.push(renderer);

    await act(async () => { button(renderer, "Take control")!.props.onClick(); });
    expect(core.commands.pause).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live", takeControl: true });
    expect(text(renderer)).toContain("User action required");
    expect(text(renderer)).toContain("then select Continue");
    expect(button(renderer, "Return control to FluxIQ")).toBeDefined();

    await act(async () => { button(renderer, "Continue")!.props.onClick(); });
    expect(core.commands.resume).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live", afterManualAction: true });
    await act(async () => { core.finish(); });
    expect(button(renderer, "Pause")).toBeUndefined();
  });

  it("pauses from the workspace header's runtime action", async () => {
    const core = fakeCore();
    const renderer = await startRun(core);
    mounted.push(renderer);
    await act(async () => { invokeAutomationStudioRuntimeAction("pause"); });
    expect(core.commands.pause).toHaveBeenCalledTimes(1);
    await act(async () => { core.finish(); });
  });

  it("puts a working Pause in the workspace header while the run can be held, and none with no run panel", async () => {
    const headerProps = {
      breadcrumbs: [],
      chrome: { setNarrowPanel: () => undefined } as never,
      commands: { closeProject: () => undefined, openDataInspector: () => undefined, openPreferences: () => undefined, openRuntime: () => undefined, requestWorkspaceSave: () => undefined } as never,
      inspectorLabel: "Inspector",
      narrow: false,
      narrowPanel: null
    };
    let header!: ReactTestRenderer;
    await act(async () => { header = create(<AutomationWorkspaceHeader {...headerProps} />); });
    mounted.push(header);
    const headerPause = () => header.root.findAll((node) => node.type === "button" && node.props["aria-label"] === "Pause automation")[0];
    expect(headerPause()).toBeUndefined();

    const core = fakeCore();
    const renderer = await startRun(core);
    mounted.push(renderer);
    expect(headerPause()?.props.disabled).toBe(false);
    await act(async () => { headerPause()!.props.onClick(); });
    expect(core.commands.pause).toHaveBeenCalledWith({ projectId: "project.one", runId: "run.live" });
    // Held, the run cannot be paused again, and the header says so.
    expect(headerPause()?.props.disabled).toBe(true);
    await act(async () => { core.finish(); });
  });

  it("shows no run controls on a host that cannot hold runs", async () => {
    const core = fakeCore();
    const { pause: _pause, resume: _resume, readControl: _read, ...withoutControl } = core.commands;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FlowRunViewContent commands={withoutControl as any} flow={flow} models={[]} pipelineArtifacts={{ replayResults: [] }} policies={[]} projectId="project.one" runtimeSessions={[]} timelines={[]} />);
    });
    mounted.push(renderer);
    await act(async () => { button(renderer, "Run")!.props.onClick(); });
    expect(button(renderer, "Pause")).toBeUndefined();
    expect(automationStudioActionSnapshot().runtime?.canPause).toBe(false);
    await act(async () => { core.finish(); });
  });
});
