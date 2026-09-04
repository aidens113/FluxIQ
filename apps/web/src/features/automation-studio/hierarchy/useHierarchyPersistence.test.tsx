import { readFileSync } from "node:fs";

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../data/program-transport";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import type { AutomationHierarchyNode } from "./contracts";
import { useHierarchyPersistence } from "./useHierarchyPersistence";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node = (id: string, label = id): AutomationHierarchyNode => ({
  id,
  label,
  kind: "folder",
  category: "flow",
  parentId: null
});

describe("useHierarchyPersistence", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { clearTimeout: globalThis.clearTimeout, setTimeout: globalThis.setTimeout }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });

  it("contains no executable retired hierarchy-save endpoint", () => {
    const source = readFileSync(new URL("./useHierarchyPersistence.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.post\(\s*["']save-project-hierarchy["']/u);
    expect(source).not.toContain('"save-project-hierarchy"');
  });

  it("persists bounded creates and removals, skips unchanged saves, and retries a failed baseline", async () => {
    let customNodes: readonly AutomationHierarchyNode[] = [];
    let requestSave = () => {};
    let persistence: ReturnType<typeof useHierarchyPersistence> | undefined;
    const setSaveStatus = vi.fn();
    const reportSaveError = vi.fn();
    const post = vi.fn<ProgramCommandTransport["post"]>(async () => ({ ok: true }));
    const transport = { post } as unknown as ProgramCommandTransport;

    function Harness() {
      persistence = useHierarchyPersistence({
        transport,
        projectId: "project/unsafe",
        loadedProjectId: "project/unsafe",
        getCustomNodes: () => customNodes,
        getDeletedIds: () => [],
        getWorkspacePrefs: defaultAutomationWorkspacePrefs,
        subscribeSaveRequests: (listener) => {
          requestSave = listener;
          return () => { requestSave = () => {}; };
        },
        setSaveStatus,
        reportSaveError
      });
      return null;
    }

    let renderer: ReactTestRenderer | undefined;
    await act(async () => { renderer = create(<Harness />); });
    persistence!.markPersisted({ customNodes: [], deletedIds: [], workspacePrefs: defaultAutomationWorkspacePrefs() });

    customNodes = [node("node/one")];
    await act(async () => { requestSave(); await vi.advanceTimersByTimeAsync(800); });
    expect(post).toHaveBeenCalledWith("put-project-hierarchy-node", expect.objectContaining({
      projectId: "project/unsafe",
      node: customNodes[0],
      mutationId: expect.not.stringContaining("/")
    }));

    post.mockClear();
    await act(async () => { requestSave(); await vi.advanceTimersByTimeAsync(800); });
    expect(post).not.toHaveBeenCalled();

    customNodes = [];
    await act(async () => { requestSave(); await vi.advanceTimersByTimeAsync(800); });
    expect(post).toHaveBeenCalledWith("delete-project-hierarchy-node", expect.objectContaining({
      projectId: "project/unsafe",
      nodeId: "node/one",
      mutationId: expect.not.stringContaining("/")
    }));

    post.mockClear();
    post.mockResolvedValueOnce({ ok: false, error: "rejected" });
    customNodes = [node("node/two")];
    await act(async () => { requestSave(); await vi.advanceTimersByTimeAsync(800); });
    expect(setSaveStatus).toHaveBeenLastCalledWith("Save failed: rejected");
    expect(reportSaveError).toHaveBeenCalledWith("rejected");

    post.mockResolvedValueOnce({ ok: true });
    await act(async () => { requestSave(); await vi.advanceTimersByTimeAsync(800); });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith("put-project-hierarchy-node", expect.objectContaining({ node: customNodes[0] }));

    await act(async () => renderer!.unmount());
  });
});
