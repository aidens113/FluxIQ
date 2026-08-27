import { describe, expect, it } from "vitest";
import { projectModalConfig } from "./ProjectModal";

describe("Automation Studio project dialog configuration", () => {
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