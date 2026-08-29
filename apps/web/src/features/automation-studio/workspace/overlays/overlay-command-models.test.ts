import { describe, expect, it } from "vitest";
import { hierarchyCommandFromDraft, hierarchyDraftForRequest } from "./hierarchy-overlay-model";
import { projectCommandFromDraft, projectDraftForRequest } from "./ProjectOverlaySubscriber";

describe("overlay command snapshots", () => {
  it("builds a complete project command from one local draft", () => {
    const request = {
      id: "request-1",
      kind: "edit-project",
      project: { id: "project-1", name: "Old", description: "Old description" }
    } as const;
    const draft = { ...projectDraftForRequest(request), name: " New ", description: " Updated ", pin: "1234" };

    expect(projectCommandFromDraft(request, draft)).toEqual({
      type: "project.update",
      requestId: "request-1",
      projectId: "project-1",
      name: "New",
      description: "Updated",
      pin: "1234"
    });
  });

  it("builds a complete hierarchy command from one local draft", () => {
    const request = {
      id: "request-2",
      kind: "create",
      category: "flow",
      categoryLabel: "Flows",
      parentId: null,
      allowedKinds: ["flow", "folder"] as const,
      folderSource: { resolve: () => null, search: () => [] },
      subflowContainer: false
    } as const;
    const draft = {
      ...hierarchyDraftForRequest(request),
      itemKind: "flow" as const,
      name: " Checkout ",
      flowOrigin: "deterministic" as const,
      pin: "9876"
    };

    expect(hierarchyCommandFromDraft(request, draft)).toEqual({
      type: "hierarchy.create",
      requestId: "request-2",
      category: "flow",
      itemKind: "flow",
      name: "Checkout",
      parentId: null,
      flowOrigin: "deterministic",
      pin: "9876"
    });
  });
});