import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectModalConfig } from "../ProjectModal";

describe("Automation Studio project dialog configuration", () => {
  it("marks ordinary project and hierarchy fields as non-credential autofill", () => {
    const project = readFileSync(new URL("../ProjectModal.tsx", import.meta.url), "utf8");
    const hierarchy = readFileSync(new URL("../AutomationHierarchyDialog.tsx", import.meta.url), "utf8");

    expect(project).toContain('name="automation-project-name"');
    expect(project).toContain('name="automation-project-description"');
    expect(project).toContain('name="automation-project-category-name"');
    expect(project).toContain('name="automation-project-authorization-pin"');
    expect(project.match(/autoComplete="off"/g)).toHaveLength(4);
    expect(hierarchy).toContain('name="automation-hierarchy-item-name"');
    expect(hierarchy.match(/name="automation-hierarchy-authorization-pin"/g)).toHaveLength(2);
    expect(hierarchy.match(/autoComplete="off"/g)).toHaveLength(3);
  });

  it("describes complete project deletion and uses a destructive command", () => {
    const config = projectModalConfig({
      mode: "delete",
      projectTarget: { id: "p1", name: "Billing", description: "", createdAt: 1, updatedAt: 1 },
      categoryTarget: null
    });
    expect(config.title).toBe("Delete project");
    expect(config.actionLabel).toBe("Delete project");
    expect(config.consequence).toContain("runtime history");
  });

  it("explains that category deletion preserves projects", () => {
    const config = projectModalConfig({
      mode: "delete-category",
      projectTarget: null,
      categoryTarget: { id: "c1", name: "Operations", order: 0, createdAt: 1, updatedAt: 1 }
    });
    expect(config.description).toContain("without deleting its projects");
    expect(config.consequence).toContain("Uncategorized");
  });
});
