import { createLargeAutomationStudioProjectFixture } from "./large-project-fixture";

export const mediumProjectFixtureCounts = Object.freeze({
  flows: 128,
  subflows: 512,
  recordings: 256,
  runs: 1_024,
  actions: 8_192,
  instructions: 512,
  adaptations: 512,
  stateFacts: 8_192,
  hierarchyNodes: 2_048,
  clients: 64,
});

export function createMediumAutomationStudioProjectFixture() {
  const fixture = createLargeAutomationStudioProjectFixture(mediumProjectFixtureCounts);
  const projectId = "project.medium";
  return {
    ...fixture,
    project: { ...fixture.project, id: projectId, name: "Medium deterministic project" },
    hierarchyNodes: fixture.hierarchyNodes.map((node) => ({ ...node, projectId })),
  };
}
