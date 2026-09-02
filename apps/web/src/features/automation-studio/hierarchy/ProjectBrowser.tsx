"use client";

import { FolderOpen, GripVertical, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { Button, EmptyState, LoadingState, Menu, StatusText } from "../../programs/shared-ui";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "./model";
import { projectGridSections } from "./ProjectModal";

export type AutomationProjectBrowserProps = {
  projects: AutomationStudioProject[];
  categories: AutomationStudioProjectCategory[];
  loaded: boolean;
  status: string;
  dragOverCategoryId: string | null;
  onRefresh(): void;
  onCreateProject(category?: AutomationStudioProjectCategory): void;
  onCreateCategory(): void;
  onOpenProject(projectId: string): void;
  onRenameProject(project: AutomationStudioProject): void;
  onDeleteProject(project: AutomationStudioProject): void;
  onRenameCategory(category: AutomationStudioProjectCategory): void;
  onDeleteCategory(category: AutomationStudioProjectCategory): void;
  onDragOverCategory(categoryId: string): void;
  onDragLeaveCategory(): void;
  onDrop(event: DragEvent<HTMLElement>, categoryId: string | null): void;
};

export function filterProjectBrowserSections(
  projects: AutomationStudioProject[],
  categories: AutomationStudioProjectCategory[],
  query: string
) {
  const normalized = query.trim().toLocaleLowerCase();
  const sections = projectGridSections(projects, categories);
  if (!normalized) return sections;
  return sections
    .map((section) => ({
      ...section,
      projects: section.projects.filter((project) =>
        [project.name, project.description, section.name].some((value) => value.toLocaleLowerCase().includes(normalized))
      )
    }))
    .filter((section) => section.projects.length > 0);
}

export function AutomationProjectBrowser(props: AutomationProjectBrowserProps) {
  const [query, setQuery] = useState("");
  const sections = useMemo(
    () => filterProjectBrowserSections(props.projects, props.categories, query),
    [props.projects, props.categories, query]
  );
  const resultCount = sections.reduce((total, section) => total + section.projects.length, 0);

  return (
    <section aria-labelledby="automation-project-browser-title" className="automation-project-browser">
      <header className="automation-project-browser-heading">
        <span className="automation-project-browser-icon"><FolderOpen size={20} aria-hidden /></span>
        <div>
          <h1 id="automation-project-browser-title">Projects</h1>
          <p>Open a project to continue building and running Flows.</p>
        </div>
      </header>

      <div aria-label="Project browser commands" className="automation-project-browser-toolbar" role="toolbar">
        <label className="automation-project-search">
          <Search size={15} aria-hidden />
          <span className="sr-only">Search projects</span>
          <input
            aria-label="Search projects"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            type="search"
            value={query}
          />
          {query ? <small>{resultCount} found</small> : null}
        </label>
        <div className="automation-project-browser-actions">
          <Button onClick={props.onRefresh} size="compact"><RefreshCw size={14} aria-hidden />{props.status ? "Retry" : "Refresh"}</Button>
          <Button onClick={props.onCreateCategory} size="compact"><Plus size={14} aria-hidden />Category</Button>
          <Button onClick={() => props.onCreateProject()} size="compact" variant="primary"><Plus size={14} aria-hidden />Project</Button>
        </div>
      </div>

      <StatusText value={props.status} />
      <div className="automation-project-sections">
        {!props.loaded ? <LoadingState detail="Reading the project index." label="Loading projects" /> : null}
        {props.loaded && !props.projects.length && !props.categories.length ? (
          <EmptyState
            action={<Button onClick={() => props.onCreateProject()} variant="primary"><Plus size={14} aria-hidden />Create project</Button>}
            description="Create a project to start building Flows."
            icon={<FolderOpen size={22} aria-hidden />}
            title="No projects yet"
          />
        ) : null}
        {props.loaded && (props.projects.length > 0 || props.categories.length > 0) && !sections.length ? (
          <EmptyState
            action={<Button onClick={() => setQuery("")}>Clear search</Button>}
            description="Try a different project name, description, or category."
            title="No matching projects"
          />
        ) : null}
        {props.loaded ? sections.map((section) => (
          <section
            aria-labelledby={`project-category-${section.id}`}
            className={props.dragOverCategoryId === section.id ? "automation-project-category-section drag-over" : "automation-project-category-section"}
            key={section.id}
            onDragLeave={props.onDragLeaveCategory}
            onDragOver={(event) => {
              event.preventDefault();
              props.onDragOverCategory(section.id);
            }}
            onDrop={(event) => props.onDrop(event, section.category?.id ?? null)}
          >
            <header
              draggable={Boolean(section.category)}
              onDragStart={(event) => {
                if (!section.category) return;
                event.dataTransfer.setData("application/x-fluxiq-project-category", section.category.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <div className="automation-project-category-title">
                {section.category ? <GripVertical size={14} aria-hidden /> : <FolderOpen size={14} aria-hidden />}
                <h2 id={`project-category-${section.id}`} title={section.name}>{section.name}</h2>
                <span>{section.projects.length}</span>
              </div>
              <Menu
                icon={<MoreHorizontal size={14} aria-hidden />}
                iconOnly
                label={`${section.name} actions`}
                options={[
                  { id: "new", label: "New project", onSelect: () => props.onCreateProject(section.category ?? undefined) },
                  ...(section.category ? [
                    { id: "rename", label: "Rename category", onSelect: () => props.onRenameCategory(section.category!) },
                    { id: "delete", label: "Delete category", danger: true, onSelect: () => props.onDeleteCategory(section.category!) }
                  ] : [])
                ]}
              />
            </header>
            <div className="automation-project-list" role="list">
              {section.projects.map((project) => (
                <div
                  className="automation-project-row"
                  draggable
                  key={project.id}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData("application/x-fluxiq-project", project.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  role="listitem"
                >
                  <button className="automation-project-row-main" onClick={() => props.onOpenProject(project.id)} title={project.name} type="button">
                    <span className="automation-project-row-icon"><FolderOpen size={16} aria-hidden /></span>
                    <span className="automation-project-row-copy">
                      <strong title={project.name}>{project.name}</strong>
                      <small title={project.description || "No description"}>{project.description || "No description"}</small>
                    </span>
                    <time dateTime={new Date(project.updatedAt).toISOString()}>Updated {formatProjectUpdatedAt(project.updatedAt)}</time>
                  </button>
                  <Menu
                    icon={<MoreHorizontal size={14} aria-hidden />}
                    iconOnly
                    label={`${project.name} actions`}
                    options={[
                      { id: "rename", label: "Rename project", onSelect: () => props.onRenameProject(project) },
                      { id: "delete", label: "Delete project", danger: true, onSelect: () => props.onDeleteProject(project) }
                    ]}
                  />
                </div>
              ))}
              {!section.projects.length && !query ? <p className="automation-project-category-empty">No projects in this category.</p> : null}
            </div>
          </section>
        )) : null}
      </div>
    </section>
  );
}

function formatProjectUpdatedAt(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
