import { defaultAutomationWorkspacePrefs } from "../workspace/layout";

export function createEmptyAutomationStudioProjectFixture() {
  const projectId = "project.empty";
  const flowId = "flow.empty";
  return {
    project: {
      id: projectId,
      name: "Empty project",
      description: "",
      categoryId: null,
      createdAt: 1,
      updatedAt: 1
    },
    hierarchy: {
      projectId,
      customNodes: [],
      deletedHierarchyIds: []
    },
    flowEntry: {
      source: "canonical",
      readOnly: false,
      flow: {
        flowId,
        name: "Empty Flow",
        description: "",
        nodes: [],
        edges: [],
        inputs: [],
        outputs: [],
        metadata: { summaryOnly: false },
        createdAt: 1,
        updatedAt: 1
      }
    },
    recordings: [],
    timelines: [],
    proposals: [],
    runtimeSessions: [],
    selection: { kind: "flow" as const, id: flowId },
    workspace: defaultAutomationWorkspacePrefs()
  };
}
