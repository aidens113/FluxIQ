import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationProjectBrowser, filterProjectBrowserSections } from "../ProjectBrowser";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../model";

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
    // One search field: no second, visible "Search projects" text beside the
    // box, and one input inside the one styled label.
    expect(markup).not.toContain(">Search projects<");
    expect(markup.match(/type="search"/gu)).toHaveLength(1);
    expect(markup).toMatch(/<label class="automation-project-search"><svg[^]*?<input/u);
    expect(markup).toContain('class="automation-project-row"');
    expect(markup).toContain('aria-label="Invoice Flow actions"');
    expect(markup).not.toContain("automation-project-tile");
  });

  it("says plainly that the list could not be loaded, offers one Try again, and shows no empty state under the failure", () => {
    const markup = renderToStaticMarkup(createElement(AutomationProjectBrowser, {
      categories: [], dragOverCategoryId: null, loaded: true, projects: [], status: "boom: raw server text",
      onCreateCategory: () => undefined, onCreateProject: () => undefined, onDeleteCategory: () => undefined,
      onDeleteProject: () => undefined, onDragLeaveCategory: () => undefined, onDragOverCategory: () => undefined,
      onDrop: () => undefined, onOpenProject: () => undefined, onRefresh: () => undefined,
      onRenameCategory: () => undefined, onRenameProject: () => undefined
    }));
    expect(markup).toContain("The projects could not be loaded.");
    expect(markup.match(/Try again/gu)).toHaveLength(1);
    expect(markup).not.toContain("boom");
    expect(markup).not.toContain("Retry");
    expect(markup).not.toContain("No projects yet");
    expect(markup).not.toContain("No projects in this category");
  });

  it("shows one empty state, not two, when there are no projects, and no 'No description' filler on a row", () => {
    const props = {
      categories: [], dragOverCategoryId: null, loaded: true, status: "",
      onCreateCategory: () => undefined, onCreateProject: () => undefined, onDeleteCategory: () => undefined,
      onDeleteProject: () => undefined, onDragLeaveCategory: () => undefined, onDragOverCategory: () => undefined,
      onDrop: () => undefined, onOpenProject: () => undefined, onRefresh: () => undefined,
      onRenameCategory: () => undefined, onRenameProject: () => undefined
    };
    const empty = renderToStaticMarkup(createElement(AutomationProjectBrowser, { ...props, projects: [] }));
    expect(empty).toContain("No projects yet");
    expect(empty).not.toContain("No projects in this category");
    const project: AutomationStudioProject = { id: "p1", name: "Shop", description: "", categoryId: null, createdAt: 1, updatedAt: 1_700_000_000_000 };
    const one = renderToStaticMarkup(createElement(AutomationProjectBrowser, { ...props, projects: [project] }));
    expect(one).toContain("Shop");
    expect(one).not.toContain("No description");
  });
});
