import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ detail: null as any, history: null as any }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../runtime-host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../runtime-host")>();
  return {
    ...actual,
    useRuntimeDetailCommands: () => host.detail,
    useRuntimeHistoryCommands: () => host.history
  };
});

import { RunHistoryViewContent } from "../RunHistory";
import { commitAutomationStudioMutation } from "../../stores";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function eventTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(name: string, listener: () => void) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeEventListener(name: string, listener: () => void) {
      listeners.get(name)?.delete(listener);
    }
  };
}

describe("Runtime Debug live refresh", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { visibilityState: "visible", ...eventTarget() });
    vi.stubGlobal("window", eventTarget());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reloads the selected run detail when that run reaches its terminal mutation", async () => {
    const loadDetail = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        payload: { runDetail: { summary: { runId: "run.one", flowId: "flow.one", status: "running" }, datasets: [], actionAttempts: [] } }
      })
      .mockResolvedValueOnce({
        ok: true,
        payload: { runDetail: {
          summary: { runId: "run.one", flowId: "flow.one", status: "succeeded" },
          datasets: [{ runId: "run.one", datasetId: "orders", label: "Orders", recordCount: 8, truncated: false }],
          actionAttempts: []
        } }
      });
    host.detail = {
      loadDetail,
      listActions: vi.fn(async () => ({ ok: true, payload: { actions: [], page: { actions: [], total: 0, limit: 50, offset: 0 } } })),
      listEvents: vi.fn(async () => ({ ok: true, payload: { events: [] } })),
      exportAudit: vi.fn(async () => ({ ok: true, payload: {} })),
      datasets: {
        list: vi.fn(), page: vi.fn(), export: vi.fn(), remove: vi.fn(), downloadHref: vi.fn()
      }
    };
    host.history = {
      listRuns: vi.fn(async () => ({ ok: true, payload: { runs: [{ runId: "run.one", flowId: "flow.one", status: "running" }], page: { total: 1, limit: 25, offset: 0 } } }))
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RunHistoryViewContent
        detailCommands={host.detail}
        flowId="flow.one"
        focusRunId="run.one"
        historyCommands={host.history}
        initialSessions={[]}
        projectId="project.one"
      />);
    });
    expect(loadDetail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("None stored");

    await act(async () => {
      commitAutomationStudioMutation({ kind: "runtime-run.changed", projectId: "project.one", flowId: "flow.one", runId: "run.one" });
      await Promise.resolve();
    });

    expect(loadDetail).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType("button").some((candidate) => candidate.children.join("") === "Orders (8 rows)")).toBe(true);
    await act(async () => renderer.unmount());
  });
});
