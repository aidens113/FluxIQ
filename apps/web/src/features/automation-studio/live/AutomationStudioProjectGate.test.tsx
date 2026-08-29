import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../../programs/types";
import { AutomationProjectCatalogSurface } from "../project";
import type { AutomationProjectApi } from "../project/project-api";
import { createAutomationProjectCatalogStore } from "../stores";
import { createAutomationStudioUiStore } from "../workspace/studio-ui-store";
import { AutomationStudioProjectGate, type AutomationStudioProjectGateProps } from "./AutomationStudioProjectGate";

describe("AutomationStudioProjectGate", () => {
  it("paints an accessible restoring shell without rendering the catalog", () => {
    const html = renderToStaticMarkup(createElement(AutomationStudioProjectGate, props("restoring")));

    expect(html).toContain('aria-label="Opening Automation Studio project"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Opening project...");
    expect(html).toContain("Restoring the project from the current URL.");
    expect(html).not.toContain("Search projects");
  });

  it("renders the accessible project catalog shell", () => {
    const html = renderToStaticMarkup(createElement(AutomationStudioProjectGate, props("catalog")));

    expect(html).toContain('aria-label="Automation Studio project selection"');
    expect(html).toContain("Choose a project");
    expect(html).toContain('aria-labelledby="automation-project-browser-title"');
    expect(html).toContain('aria-label="Project browser commands"');
    expect(html).toContain('aria-label="Search projects"');
  });

  it("forwards catalog callbacks and dependencies unchanged", () => {
    const input = props("catalog");
    const gate = AutomationStudioProjectGate(input);
    const catalog = findElement(gate, AutomationProjectCatalogSurface);

    expect(catalog).not.toBeNull();
    expect(catalog?.props.api).toBe(input.api);
    expect(catalog?.props.catalog).toBe(input.catalog);
    expect(catalog?.props.currentUser).toBe(input.currentUser);
    expect(catalog?.props.onOpenProject).toBe(input.onOpenProject);
    expect(catalog?.props.refreshProjects).toBe(input.refreshProjects);
    expect(catalog?.props.studioUiStore).toBe(input.studioUiStore);
  });
});

function props(state: AutomationStudioProjectGateProps["state"]): AutomationStudioProjectGateProps {
  return {
    state,
    api: { get: vi.fn(), post: vi.fn() } as unknown as AutomationProjectApi,
    catalog: createAutomationProjectCatalogStore({
      projects: [],
      categories: [],
      activeProjectId: null,
      loaded: true,
      loading: false,
      error: null
    }),
    currentUser: {
      id: "user.one",
      displayName: "Studio User",
      roleId: "role.user",
      totpEnabled: false,
      pinConfigured: false
    } satisfies CurrentUser,
    onOpenProject: vi.fn(),
    refreshProjects: vi.fn(),
    studioUiStore: createAutomationStudioUiStore()
  };
}

function findElement(
  node: ReactNode,
  type: typeof AutomationProjectCatalogSurface
): ReactElement<ComponentProps<typeof AutomationProjectCatalogSurface>> | null {
  if (!node || typeof node !== "object" || !("type" in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) {
    return element as ReactElement<ComponentProps<typeof AutomationProjectCatalogSurface>>;
  }
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}