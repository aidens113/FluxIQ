import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlowGraphStatus } from "../flow-editor/FlowGraphStatus";
import { applyAutomationGraphDraftRestore, discardAutomationGraphRecovery, reloadSavedAutomationGraph, shouldRestoreAutomationGraphDraft } from "./recovery-actions";

describe("graph recovery actions", () => {
  it("detects stale drafts and requires explicit restore confirmation", () => {
    const confirm = vi.fn(() => false);
    expect(shouldRestoreAutomationGraphDraft(false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(shouldRestoreAutomationGraphDraft(true, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("restores and discards only after successful durable commands", async () => {
    const apply = vi.fn();
    expect(applyAutomationGraphDraftRestore({ status: "failure", error: "restore failed" }, apply)).toEqual({ ok: false, error: "restore failed" });
    expect(apply).not.toHaveBeenCalled();
    expect(applyAutomationGraphDraftRestore({ status: "success", value: { draftKey: "flow:1", graph: { nodes: [], edges: [] } } }, apply)).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(1);
    const clear = vi.fn();
    await expect(discardAutomationGraphRecovery(async () => ({ status: "failure", error: "discard failed" }), clear)).resolves.toEqual({ ok: false, error: "discard failed" });
    expect(clear).not.toHaveBeenCalled();
    await expect(discardAutomationGraphRecovery(async () => ({ status: "success", value: {} }), clear)).resolves.toEqual({ ok: true });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("keeps drafts on failed reload and clears them only after a saved graph is loaded", async () => {
    const clearDraft = vi.fn(); const markClean = vi.fn(); const notify = vi.fn();
    await expect(reloadSavedAutomationGraph({ reload: async () => null, clearDraft, markClean, notify })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("draft was kept") });
    expect(clearDraft).not.toHaveBeenCalled(); expect(markClean).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
    await expect(reloadSavedAutomationGraph({ reload: async () => ({ flowId: "flow.one" }), clearDraft, markClean, notify })).resolves.toEqual({ ok: true });
    expect(clearDraft).toHaveBeenCalledTimes(1); expect(markClean).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
  });

  it("renders retry and reload recovery for a save conflict", () => {
    const html = renderToStaticMarkup(<FlowGraphStatus controller={{ codeOwned: false, flowEdges: [], flowHistoryState: { estimatedBytes: 0 }, flowNodes: [], flowViewportState: "ready", flowViewportStats: { cachedPartitions: 0 }, saveState: "conflict", saveFlowGraph: vi.fn() } as any} props={{ onReloadGraph: vi.fn() } as any} />);
    expect(html).toContain("Retry Save");
    expect(html).toContain("Reload Saved Graph");
    expect(html).toContain("Your graph draft is preserved");
  });
});
