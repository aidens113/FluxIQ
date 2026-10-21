import { describe, expect, it } from "vitest";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityToolCall } from "../index.ts";

const card = (call: Parameters<typeof automationStudioActivityToolCall>[0]) => {
  const words = automationStudioActivityToolCall(call);
  return activityActionOf({ phase: words.phase, detail: { kind: words.kind, title: words.title, status: "succeeded", ref: call.toolId, text: "Result: web.action.succeeded · Node: web.output.dom-click" } });
};

// t753: a project build's own calls read "Using “Submit subflow”" and
// "Action · Submit subflow": no tool's own name may reach the person.
describe("t753: a build's own tools are said as what they do", () => {
  it("says saving and testing one part of the Flow", () => {
    expect(automationStudioActivityToolCall({ callId: "c1", toolId: "core.submit_subflow", value: { revision: 2 } }).title).toBe("Saving one part of the Flow");
    expect(automationStudioActivityToolCall({ callId: "c2", toolId: "core.test_subflow", value: {} }).title).toBe("Testing one part of the Flow");
    expect(activityActionOf({ phase: "exploring", detail: { kind: "tool", title: "Saving one part of the Flow", status: "succeeded", ref: "core.submit_subflow" } })?.kind).toBe("draft");
    expect(activityActionOf({ phase: "exploring", detail: { kind: "tool", title: "Testing one part of the Flow", status: "succeeded", ref: "core.test_subflow" } })?.kind).toBe("test");
  });

  it("never says a tool's own name for a tool it does not know", () => {
    for (const toolId of ["core.frobnicate_widgets", "acme.fetch_widgets"]) {
      const title = automationStudioActivityToolCall({ callId: "c3", toolId, value: {} }).title;
      expect(title).not.toMatch(/frobnicate|fetch|widgets|“/iu);
    }
  });
});

// t753: an undo of the build's own act before a trial read as an ordinary
// press ("Click · Remove · Done").
describe("t753: a call that undoes one of the build's acts", () => {
  const undo = { callId: "u1", toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: { element: { role: "button", accessibleName: "Remove" } }, undoes: "act-2" } };
  it("is said as putting the site back, and its card says so", () => {
    expect(automationStudioActivityToolCall(undo).title).toBe("Putting the site back: clicking “Remove”");
    expect(card(undo)).toMatchObject({ kind: "click", name: "Put back", target: "Remove", outcome: "done" });
  });

  it("leaves a call with no undo as it was", () => {
    const { undoes: _undoes, ...plain } = undo.value;
    expect(automationStudioActivityToolCall({ ...undo, value: plain }).title).toBe("Clicking “Remove”");
  });
});
