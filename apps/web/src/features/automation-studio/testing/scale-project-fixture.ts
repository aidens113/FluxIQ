import {
  createLargeAutomationStudioProjectFixture,
  defaultLargeProjectFixtureCounts,
  type LargeProjectFixtureCounts,
} from "./large-project-fixture";

export const scaleProjectFixtureCounts = defaultLargeProjectFixtureCounts;

export function createScaleAutomationStudioProjectFixture(
  requested: Partial<LargeProjectFixtureCounts> = {},
) {
  const fixture = createLargeAutomationStudioProjectFixture(requested);
  const projectId = "project.scale";
  return {
    ...fixture,
    project: { ...fixture.project, id: projectId, name: "Scale deterministic project" },
    hierarchyNodes: fixture.hierarchyNodes.map((node) => ({ ...node, projectId })),
  };
}
