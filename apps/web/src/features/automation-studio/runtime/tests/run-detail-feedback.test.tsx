import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunActionLogViewContent } from "../RunActionLogView";

vi.mock("../../datasets", () => ({ RunDatasetsPanel: () => null }));
vi.mock("../RunDetailPanels", () => ({
  RuntimeAttemptRow: ({ attempt, onSelect }: any) => <button onClick={onSelect}>Attempt {attempt.attemptId}</button>,
  RuntimeActionDetailPanel: ({ attempt, onClose }: any) => <section><pre>{JSON.stringify(attempt)}</pre><button onClick={onClose}>Close action</button></section>,
  JsonPreview: ({ value }: any) => <pre>{JSON.stringify(value)}</pre>,
  RuntimeLlmAdaptationPanel: () => null, RuntimeRecoveryRoutingPanel: () => null,
  RuntimeRunStateEffectsPanel: () => null, RuntimeRunStory: () => null, RuntimeMetricsPanel: () => null
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const attempts = ["a", "b"].map((attemptId) => ({ attemptId, metadata: { summaryOnly: true } }));
const events = [1, 2].map((sequence) => ({ eventId: `event-${sequence}`, sequence, title: `Event ${sequence}`, metadata: { summaryOnly: true } }));
let renderer: ReactTestRenderer;
let commands: any;
const text = () => JSON.stringify(renderer.toJSON());
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer.root.findAllByType("button").find((node) => node.props["aria-label"] === name || label(node) === name)!;
async function mount() {
  await act(async () => { renderer = create(<RunActionLogViewContent projectId="p" runId="r" runDetail={{ summary: { status: "completed" } }} loading={false} error="" onBack={() => {}} commands={commands} />); });
}
function deferred() {
  let resolve!: (value: any) => void;
  return { promise: new Promise<any>((done) => { resolve = done; }), resolve: (value: any) => resolve(value) };
}
beforeEach(() => {
  commands = {
    listActions: vi.fn(async () => ({ ok: true, payload: { actions: attempts } })),
    listEvents: vi.fn(async () => ({ ok: true, payload: { events } })),
    loadActionDetail: vi.fn(async () => ({ ok: false, error: "Synthetic refusal" })),
    loadEventDetail: vi.fn(async () => ({ ok: false, error: "Synthetic refusal" })),
    loadDetail: vi.fn(), exportAudit: vi.fn()
  };
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

describe("Selected run detail feedback", () => {
  it("labels retained action summary after failure and retries full detail", async () => {
    await mount();
    await act(async () => button("Attempt a").props.onClick());
    expect(text()).toContain("Action details could not be loaded");
    expect(text()).toContain("Summary only");
    commands.loadActionDetail.mockResolvedValue({ ok: true, payload: { action: { attemptId: "a", output: "Synthetic full detail" } } });
    await act(async () => button("Retry action details").props.onClick());
    expect(text()).toContain("Synthetic full detail");
    expect(text()).not.toContain("Action details could not be loaded");
  });

  it("labels retained event summary after failure and retries full detail", async () => {
    await mount();
    await act(async () => button("Load Event Stream").props.onClick());
    const eventButton = renderer.root.findAllByType("button").find((node) => node.findAllByType("strong").some((strong) => strong.children.includes("Event 1")))!;
    await act(async () => eventButton.props.onClick());
    expect(text()).toContain("Event details could not be loaded");
    expect(text()).toContain("Summary only");
    commands.loadEventDetail.mockResolvedValue({ ok: true, payload: { event: { sequence: 1, title: "Synthetic full event" } } });
    await act(async () => button("Retry event details").props.onClick());
    expect(text()).toContain("Synthetic full event");
    expect(text()).not.toContain("Event details could not be loaded");
  });

  it("clears pending action loading when selecting an already complete row", async () => {
    const pending = deferred();
    commands.loadActionDetail.mockReturnValue(pending.promise);
    commands.listActions.mockResolvedValue({ ok: true, payload: { actions: [attempts[0], { attemptId: "b", output: "Already complete" }] } });
    await mount();
    act(() => button("Attempt a").props.onClick());
    act(() => button("Attempt b").props.onClick());
    expect(text()).not.toContain("Loading action details");
    await act(async () => pending.resolve({ ok: true, payload: { action: { attemptId: "a", output: "Obsolete response" } } }));
    expect(text()).toContain("Already complete");
    expect(text()).not.toContain("Obsolete response");
  });

  it("rejects mismatched action details and catches transport failures for retry", async () => {
    commands.loadActionDetail.mockResolvedValueOnce({ ok: true, payload: { action: { attemptId: "wrong", output: "Wrong detail" } } });
    await mount();
    await act(async () => button("Attempt a").props.onClick());
    expect(text()).not.toContain("Wrong detail");
    expect(text()).toContain("Action details could not be loaded");
    commands.loadActionDetail.mockRejectedValueOnce(new Error("Synthetic connection failure"));
    await act(async () => button("Retry action details").props.onClick());
    expect(text()).toContain("Action details could not be loaded");
    expect(button("Retry action details").props.disabled).not.toBe(true);
  });

  it("closing pending details prevents later completion from reopening them", async () => {
    const pending = deferred();
    commands.loadActionDetail.mockReturnValue(pending.promise);
    await mount();
    act(() => button("Attempt a").props.onClick());
    act(() => button("Close action").props.onClick());
    await act(async () => pending.resolve({ ok: true, payload: { action: { attemptId: "a", output: "Closed response" } } }));
    expect(text()).not.toContain("Closed response");
    expect(text()).not.toContain("Loading action details");
  });

  it("changing action pages prevents old detail from reopening the previous row", async () => {
    const pending = deferred();
    commands.loadActionDetail.mockReturnValue(pending.promise);
    commands.listActions.mockResolvedValueOnce({ ok: true, payload: { actions: attempts, page: { total: 3, limit: 2, hasMore: true, nextCursor: "next" } } });
    await mount();
    act(() => button("Attempt a").props.onClick());
    commands.listActions.mockResolvedValue({ ok: true, payload: { actions: [{ attemptId: "c" }] } });
    await act(async () => button("Next").props.onClick());
    await act(async () => pending.resolve({ ok: true, payload: { action: { attemptId: "a", output: "Old page detail" } } }));
    expect(text()).not.toContain("Old page detail");
    expect(button("Attempt c")).toBeDefined();
  });

  it("handles mismatched and rejected event detail without losing the summary", async () => {
    commands.loadEventDetail.mockResolvedValueOnce({ ok: true, payload: { event: { sequence: 2, title: "Wrong event" } } });
    await mount();
    await act(async () => button("Load Event Stream").props.onClick());
    const eventButton = renderer.root.findAllByType("button").find((node) => node.findAllByType("strong").some((strong) => strong.children.includes("Event 1")))!;
    await act(async () => eventButton.props.onClick());
    expect(text()).not.toContain("Wrong event");
    expect(text()).toContain("Event details could not be loaded");
    commands.loadEventDetail.mockRejectedValueOnce(new Error("Synthetic connection failure"));
    await act(async () => button("Retry event details").props.onClick());
    expect(button("Retry event details").props.disabled).not.toBe(true);
    expect(text()).toContain("Summary only");
  });

  it("scope changes discard old detail completions and errors", async () => {
    const pending = deferred();
    commands.loadActionDetail.mockReturnValue(pending.promise);
    await mount();
    act(() => button("Attempt a").props.onClick());
    await act(async () => renderer.update(<RunActionLogViewContent projectId="other" runId="other-run" runDetail={{ summary: { status: "completed" } }} loading={false} error="" onBack={() => {}} commands={commands} />));
    await act(async () => pending.resolve({ ok: false, error: "Obsolete refusal" }));
    expect(text()).not.toContain("Action details could not be loaded");
    expect(text()).not.toContain("Obsolete refusal");
    expect(text()).not.toContain("Loading action details");
  });
});
