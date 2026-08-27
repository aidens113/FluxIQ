import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationProjectBrowser, filterProjectBrowserSections } from "./ProjectBrowser";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "./model";

const categories: AutomationStudioProjectCategory[] = [
  { id: "category-a", name: "Operations", order: 0, createdAt: 1, updatedAt: 1 }
];
const projects: AutomationStudioProject[] = [
  { id: "project-a", name: "Invoice Flow", description: "Processes bills", categoryId: "category-a", createdAt: 1, updatedAt: 2 },
  { id: "project-b", name: "Daily Report", description: "Summary", categoryId: null, createdAt: 1, updatedAt: 3 }
];

describe("AutomationProjectBrowser", () => {
  it("groups projects by category and uncategorized ownership", () => {
    const sections = filterProjectBrowserSections(projects, categories, "");
    expect(sections.map((section) => [section.name, section.projects.length])).toEqual([
      ["Operations", 1],
      ["Uncategorized", 1]
    ]);
  });

  it("searches project names, descriptions, and category names", () => {
    expect(filterProjectBrowserSections(projects, categories, "bill")[0]?.projects[0]?.id).toBe("project-a");
    expect(filterProjectBrowserSections(projects, categories, "operations")[0]?.projects[0]?.id).toBe("project-a");
    expect(filterProjectBrowserSections(projects, categories, "missing")).toEqual([]);
  });

  it("renders compact project rows and labelled commands", () => {
    const markup = renderToStaticMarkup(createElement(AutomationProjectBrowser, {
      categories,
      dragOverCategoryId: null,
      loaded: true,
      projects,
      status: "",
      onCreateCategory: () => undefined,
      onCreateProject: () => undefined,
      onDeleteCategory: () => undefined,
      onDeleteProject: () => undefined,
      onDragLeaveCategory: () => undefined,
      onDragOverCategory: () => undefined,
      onDrop: () => undefined,
      onOpenProject: () => undefined,
      onRefresh: () => undefined,
      onRenameCategory: () => undefined,
      onRenameProject: () => undefined
    }));
    expect(markup).toContain('aria-label="Search projects"');
    expect(markup).toContain('class="automation-project-row"');
    expect(markup).toContain('aria-label="Invoice Flow actions"');
    expect(markup).not.toContain("automation-project-tile");
  });});
