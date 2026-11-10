import { describe, expect, it } from "vitest";
import { onScreenFromContext } from "../on-screen-from-context";
import { INITIAL_PANEL_CONTEXT, panelContextReducer } from "../reducer";

describe("the panel context", () => {
  it("starts on Home with nothing picked", () => {
    expect(INITIAL_PANEL_CONTEXT).toEqual({ page: "home" });
  });

  it("takes the page a page publishes, with what it picked", () => {
    const next = panelContextReducer(INITIAL_PANEL_CONTEXT, { type: "publish", page: "flows", selection: { flowId: "flow.a", stepNumbers: [5] } });
    expect(next).toEqual({ page: "flows", flowId: "flow.a", stepNumbers: [5] });
  });

  it("drops what the last page picked when the next page publishes", () => {
    const flows = panelContextReducer(INITIAL_PANEL_CONTEXT, { type: "publish", page: "flows", selection: { flowId: "flow.a", folder: "web" } });
    expect(panelContextReducer(flows, { type: "publish", page: "runs", selection: { runId: "run.1" } })).toEqual({ page: "runs", runId: "run.1" });
  });

  it("keeps the project the person chose across pages, and drops the picks when the project changes", () => {
    const chosen = panelContextReducer(INITIAL_PANEL_CONTEXT, { type: "project", projectId: "p1" });
    const flows = panelContextReducer(chosen, { type: "publish", page: "flows", selection: { flowId: "flow.a" } });
    expect(flows).toEqual({ page: "flows", projectId: "p1", flowId: "flow.a" });
    expect(panelContextReducer(flows, { type: "project", projectId: "p2" })).toEqual({ page: "flows", projectId: "p2" });
    expect(panelContextReducer(flows, { type: "project", projectId: undefined })).toEqual({ page: "flows" });
  });

  it("ignores empty picks, and a page cannot smuggle its own page in", () => {
    const picked = { nodeIds: [], page: "security" };
    const next = panelContextReducer(INITIAL_PANEL_CONTEXT, { type: "publish", page: "data", selection: picked });
    expect(next).toEqual({ page: "data" });
  });

  it("returns the same object when nothing changed, so nothing renders again", () => {
    const flows = panelContextReducer(INITIAL_PANEL_CONTEXT, { type: "publish", page: "flows", selection: { flowId: "flow.a" } });
    expect(panelContextReducer(flows, { type: "publish", page: "flows", selection: { flowId: "flow.a" } })).toBe(flows);
    expect(panelContextReducer(flows, { type: "project", projectId: undefined })).toBe(flows);
  });
});

describe("what the dock sends", () => {
  it("is the page and the selection, plus the Flow and run the chat already knows by name", () => {
    expect(onScreenFromContext({ page: "runs", projectId: "p1", runId: "run.1", flowId: "flow.a", stepNumbers: [2] })).toEqual({
      page: "runs",
      selection: { projectId: "p1", runId: "run.1", flowId: "flow.a", stepNumbers: [2] },
      flowId: "flow.a",
      runId: "run.1"
    });
  });

  it("sends only the page when nothing is picked", () => {
    expect(onScreenFromContext({ page: "home" })).toEqual({ page: "home", selection: {} });
  });
});
