import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";

const transport = { post: vi.fn(), get: vi.fn() };
import { TaskInstructionsPanel } from "../TaskInstructionsPanel";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  transport.post.mockReset();
  transport.post.mockImplementation(async (endpoint: string) => {
    if (endpoint === "get-flow-instruction-readiness") return { ok: true, payload: { ready: true, instructionIds: ["task.one"] } };
    if (endpoint === "get-flow-instruction") return { ok: true, payload: { instruction: { body: "Read the current bulletin.", linkedRecordingIds: ["recording.hidden"] } } };
    if (endpoint === "list-recordings") return { ok: true, payload: { recordings: [{ recordingId: "recording.described", description: "Demonstration of reading the bulletin.", endedAt: 10 }, { recordingId: "recording.legacy", endedAt: 10 }], page: { total: 101 } } };
    return { ok: true, payload: { instruction: { status: "active" } } };
  });
});

function save(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType("button").find((node) => node.children.includes("Save task instructions"))!;
}

it("preserves prior attachments outside the first page and keeps task and description separate", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TaskInstructionsPanel commands={transport} projectId="project.one" flowId="flow.old" />); });
  expect(renderer.root.findByType("textarea").props.value).toBe("Read the current bulletin.");
  expect(renderer.root.findAllByType("input")).toHaveLength(2);
  await act(async () => save(renderer).props.onClick());
  expect(transport.post).toHaveBeenCalledWith("save-flow-generation-instruction", { projectId: "project.one", flowId: "flow.old", instruction: "Read the current bulletin.", instructionId: "task.one", linkedRecordingIds: ["recording.hidden"] });
  await act(async () => renderer.unmount());
});

it("keeps authored text after a failed save", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TaskInstructionsPanel commands={transport} projectId="project.one" flowId="flow.old" />); });
  await act(async () => renderer.root.findByType("textarea").props.onChange({ target: { value: "My explicit task" } }));
  transport.post.mockResolvedValueOnce({ ok: false, error: "Save refused" });
  await act(async () => save(renderer).props.onClick());
  expect(renderer.root.findByType("textarea").props.value).toBe("My explicit task");
  expect(renderer.root.findByProps({ role: "alert" }).children).toContain("Save refused");
  await act(async () => renderer.unmount());
});

it("does not clear unknown attachments when optional evidence loading fails", async () => {
  transport.post.mockImplementation(async (endpoint: string) => {
    if (endpoint === "list-recordings") return { ok: false, error: "Evidence unavailable" };
    if (endpoint === "get-flow-instruction-readiness") return { ok: true, payload: { ready: true, instructionIds: ["task.one"] } };
    return { ok: true, payload: {} };
  });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TaskInstructionsPanel commands={transport} projectId="project.one" flowId="flow.old" />); });
  expect(renderer.root.findByType("fieldset").props.disabled).toBe(true);
  await act(async () => renderer.root.findByType("textarea").props.onChange({ target: { value: "My explicit task" } }));
  await act(async () => save(renderer).props.onClick());
  const saved = transport.post.mock.calls.find(([endpoint]) => endpoint === "save-flow-generation-instruction")!;
  expect(saved[1]).toEqual({ projectId: "project.one", flowId: "flow.old", instruction: "My explicit task" });
  expect(Object.hasOwn(saved[1], "linkedRecordingIds")).toBe(false);
  await act(async () => renderer.unmount());
});

it("owner switching clears busy without admitting an old save result", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<TaskInstructionsPanel commands={transport} projectId="project.one" flowId="flow.old" />); });
  let release!: (answer: unknown) => void;
  transport.post.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  await act(async () => { save(renderer).props.onClick(); });
  await act(async () => renderer.update(<TaskInstructionsPanel commands={transport} projectId="project.two" flowId="flow.new" />));
  expect(save(renderer).props.disabled).toBe(false);
  await act(async () => { release({ ok: true }); });
  expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
  await act(async () => renderer.unmount());
});
