import { createLargeAutomationStudioProjectFixture } from "./large-project-fixture";

export const smallProjectFixtureCounts = Object.freeze({
  flows: 2,
  subflows: 8,
  recordings: 2,
  runs: 36,
  actions: 240,
  instructions: 12,
  adaptations: 16,
  stateFacts: 240,
  hierarchyNodes: 80,
  clients: 2,
});

export function createSmallAutomationStudioProjectFixture() {
  const fixture = createLargeAutomationStudioProjectFixture(smallProjectFixtureCounts);
  const projectId = "project.small";
  return {
    ...fixture,
    project: { ...fixture.project, id: projectId, name: "Small deterministic project" },
    hierarchyNodes: fixture.hierarchyNodes.map((node) => ({ ...node, projectId })),
  };
}