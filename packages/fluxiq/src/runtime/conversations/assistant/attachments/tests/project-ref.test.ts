// A panel turn's project-bound attachment is stored with the project it refers
// into, and read back as that project and the resolver's own reference; a
// reference stored without a project names none.

import { describe, expect, it } from "vitest";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT } from "../../loop/index.ts";
import { panelAssistantAttachmentProjects } from "../project-ref.ts";

const { stored, projectOf } = panelAssistantAttachmentProjects;

describe("panel turn attachment projects", () => {
  it("stores a project-bound reference with its project, and reads both back", () => {
    const kept = stored({ kind: "flow-graph-diff", ref: "flow.1:adaptation.1", projectId: "project.a" });
    expect(kept).toEqual({ kind: "flow-graph-diff", ref: "{\"projectId\":\"project.a\",\"ref\":\"flow.1:adaptation.1\"}" });
    expect(projectOf(kept)).toEqual({ projectId: "project.a", attachment: { kind: "flow-graph-diff", ref: "flow.1:adaptation.1" } });
  });

  it("stores a navigation as it is, with or without a project", () => {
    const ref = JSON.stringify({ tool: "panel.open", input: { page: "runs" } });
    expect(stored({ kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref })).toEqual({ kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref });
    expect(stored({ kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref, projectId: "project.a" })).toEqual({ kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref });
  });

  it("refuses to store a project-bound reference that names no project, or names the panel thread's own", () => {
    for (const projectId of [undefined, "", "  ", "panel"]) {
      expect(() => stored({ kind: "flow-graph-diff", ref: "flow.1:adaptation.1", ...(projectId === undefined ? {} : { projectId }) })).toThrow("A panel turn's attachment of kind flow-graph-diff names the project it refers into.");
    }
    expect(() => stored({ kind: "flow-graph-diff", ref: "flow.1:adaptation.1", projectId: "not a project id" })).toThrow("Invalid project ID.");
  });

  it("reads a reference stored without a project as naming none", () => {
    expect(projectOf({ kind: "flow-graph-diff", ref: "flow.1:adaptation.1" })).toBeNull();
    expect(projectOf({ kind: "panel-capability-result", ref: "adaptation.apply" })).toBeNull();
  });

  it("refuses a stored reference whose project part cannot be read", () => {
    const unreadable = "This deployment cannot serve a conversation attachment of kind flow-graph-diff.";
    for (const ref of ["{not json", "{\"ref\":\"flow.1:adaptation.1\"}", "{\"projectId\":\"panel\",\"ref\":\"flow.1:adaptation.1\"}", "{\"projectId\":\"project.a\"}", "{\"projectId\":\"project.a\",\"ref\":\"  \"}"]) {
      expect(() => projectOf({ kind: "flow-graph-diff", ref })).toThrow(unreadable);
    }
    expect(() => projectOf({ kind: "flow-graph-diff", ref: "{\"projectId\":\"a b\",\"ref\":\"flow.1:adaptation.1\"}" })).toThrow("Invalid project ID.");
  });
});
