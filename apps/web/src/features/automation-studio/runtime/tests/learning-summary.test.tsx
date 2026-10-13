import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeExecutionCommands } from "../runtime-host";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../RunHistory", () => ({ RunHistory: () => null }));

import { FlowRunViewContent, RuntimePostRunSummary } from "../FlowRunView";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, window: globalThis });

afterEach(() => vi.useRealTimers());

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.children.includes(label))!;
}

const flow = { flowId: "flow.bulletin", nodes: [{ id: "read" }], interface: { inputs: [] }, metadata: {} };

function commands(): RuntimeExecutionCommands {
  return {
    loadReadiness: vi.fn(async () => ({ error: "", instructions: [], instructionReadiness: { ready: true, instructionIds: ["task.one"] }, router: null, subflowTotal: 0 })),
    start: vi.fn(async () => ({ ok: true, payload: { runtimeSession: { runId: "run.queued" } } })),
    execute: vi.fn(async () => ({ ok: false, status: 408, code: "request_timeout" })),
    cancel: vi.fn(async () => ({ ok: true })),
    generateBootstrap: vi.fn(async () => ({ ok: true, payload: {} })),
    saveGenerationInstruction: vi.fn(async () => ({ ok: true, payload: {} })),
    generateFromWebsite: vi.fn(async () => ({ ok: true, payload: {} }))
  };
}

describe("authoritative learned state after a cut-short response", () => {
  for (const scenario of [
    { name: "held automatic intent", durable: false, metadata: { runtimePatchAttempts: [{ adaptationId: "a.one", approvalDecision: { autoApply: true, applied: false } }] } },
    { name: "kept handler", durable: true, metadata: { inRunRepairs: [{ adaptationId: "a.one", approvalDecision: { autoApply: true, applied: true } }] } },
    { name: "kept reauthor", durable: true, metadata: { resultReauthor: { adaptationId: "a.one", applied: true } } },
    { name: "unknown old summary", durable: undefined, metadata: { runtimePatchAttempts: [{ adaptationId: "a.one", approvalDecision: { autoApply: true } }] } }
  ]) {
    it(`uses the server summary for ${scenario.name}`, async () => {
      vi.useFakeTimers();
      const runtimeCommands = commands();
      const loadRunDetail = vi.fn(async (payload: { runId: string }) => ({
        ok: true,
        payload: { runDetail: { summary: { runId: payload.runId, flowId: flow.flowId, status: "succeeded", ...(scenario.durable === undefined ? {} : { durableBehaviorChanged: scenario.durable }) }, adaptationIds: ["a.one"], metadata: scenario.metadata } }
      }));
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(<FlowRunViewContent commands={runtimeCommands} flow={flow} loadRunDetail={loadRunDetail} models={[]} pipelineArtifacts={{ replayResults: [] }} policies={[]} projectId="project.one" runtimeSessions={[]} timelines={[]} />); });
      await act(async () => button(renderer, "Explore and adapt").props.onClick());
      await act(async () => button(renderer, "Run").props.onClick());
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      const result = renderer.root.findByType(RuntimePostRunSummary).props.result;
      expect(result.durableBehaviorChanged).toBe(scenario.durable);
      expect(result.createdAdaptationIds).toEqual(["a.one"]);
      expect(loadRunDetail).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project.one", compact: true }));
      await act(async () => renderer.unmount());
    });
  }
});

describe("post-run learning explanation", () => {
  for (const status of ["succeeded", "failed", "cancelled"]) {
    it(`does not present an unkept change as learned after ${status}`, async () => {
      let renderer!: ReactTestRenderer;
      await act(async () => { renderer = create(<RuntimePostRunSummary result={{ runtimeSession: { runId: "run.one", status }, createdAdaptationIds: ["a.one"], durableBehaviorChanged: false }} />); });
      const rendered = JSON.stringify(renderer.toJSON());
      expect(rendered).toContain("Changes were recorded, but this run did not keep a change for future runs.");
      expect(rendered).not.toContain("must be reviewed and approved");
      expect(rendered).not.toContain("This run kept a change for future runs.");
      await act(async () => renderer.unmount());
    });
  }

  it("explains actual kept changes without claiming a later run reused them", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<RuntimePostRunSummary result={{ runtimeSession: { runId: "run.one", status: "succeeded" }, createdAdaptationIds: [], durableBehaviorChanged: true }} />); });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("This run kept a change for future runs.");
    expect(rendered).not.toContain("must be reviewed and approved");
    expect(rendered).not.toContain("reused");
    await act(async () => renderer.unmount());
  });

  it("keeps missing application proof unknown", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<RuntimePostRunSummary result={{ runtimeSession: { runId: "run.one" }, createdAdaptationIds: ["a.one"] }} />); });
    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Whether this run kept a change is not available.");
    expect(rendered).toContain("unknown");
    expect(rendered).not.toContain("must be reviewed and approved");
    await act(async () => renderer.unmount());
  });
});
