"use client";

import { Button, Field, InlineNotice, KeyValue, Modal } from "../../programs/shared-ui";
import type { CurrentUser } from "../../programs/types";
import type { AutomationProjectModal, AutomationStudioProject, AutomationStudioProjectCategory } from "./model";

export function AutomationProjectModalView(props: {
  busy: boolean;
  categoryName: string;
  categoryTarget: AutomationStudioProjectCategory | null;
  currentUser: CurrentUser;
  description: string;
  mode: Exclude<AutomationProjectModal, null>;
  name: string;
  pin: string;
  projectTarget: AutomationStudioProject | null;
  status: string;
  onCategoryNameChange(value: string): void;
  onClose(): void;
  onCreate(): void;
  onCreateCategory(): void;
  onDelete(): void;
  onDeleteCategory(): void;
  onDescriptionChange(value: string): void;
  onMove(): void;
  onMoveCategory(): void;
  onNameChange(value: string): void;
  onPinChange(value: string): void;
  onRename(): void;
  onRenameCategory(): void;
}) {
  const isProjectForm = props.mode === "create" || props.mode === "rename";
  const isCategoryForm = props.mode === "create-category" || props.mode === "rename-category";
  const isDelete = props.mode === "delete" || props.mode === "delete-category";
  const pinReady = Boolean(props.currentUser.pinConfigured) && props.pin.length >= 4;
  const contentReady = isProjectForm ? Boolean(props.name.trim()) : isCategoryForm ? Boolean(props.categoryName.trim()) : true;
  const config = projectModalConfig(props);
  const submit = props.mode === "create" ? props.onCreate
    : props.mode === "rename" ? props.onRename
    : props.mode === "delete" ? props.onDelete
    : props.mode === "move" ? props.onMove
    : props.mode === "create-category" ? props.onCreateCategory
    : props.mode === "rename-category" ? props.onRenameCategory
    : props.mode === "delete-category" ? props.onDeleteCategory
    : props.onMoveCategory;

  return (
    <Modal
      busy={props.busy}
      closeOnEscape={!props.busy}
      description={config.description}
      title={config.title}
      onClose={props.onClose}
    >
      <div className="dialog-form">
        {isProjectForm ? (
          <>
            <Field label="Project name" required>
              <input autoFocus maxLength={120} value={props.name} onChange={(event) => props.onNameChange(event.target.value)} />
            </Field>
            <Field hint="Optional. This appears in project search results." label="Description">
              <textarea maxLength={500} rows={3} value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} />
            </Field>
          </>
        ) : null}
        {isCategoryForm ? (
          <Field label="Category name" required>
            <input autoFocus maxLength={120} value={props.categoryName} onChange={(event) => props.onCategoryNameChange(event.target.value)} />
          </Field>
        ) : null}
        {props.mode === "move" ? <KeyValue rows={[
          ["Project", props.projectTarget?.name ?? "Project"],
          ["Destination", props.categoryTarget?.name ?? "Uncategorized"]
        ]} /> : null}
        {props.mode === "move-category" ? <KeyValue rows={[
          ["Category", props.categoryTarget?.name ?? "Category"],
          ["Position", "Before the selected category"]
        ]} /> : null}
        {isDelete ? <InlineNotice message={config.consequence} title="This cannot be undone" tone="warning" /> : null}
        {!props.currentUser.pinConfigured ? (
          <InlineNotice message="Configure a security PIN in Identity and Access before changing projects or categories." title="PIN not configured" tone="error" />
        ) : (
          <Field hint="Use your current user security PIN." label="Security PIN" required>
            <input
              autoComplete="off"
              autoFocus={isDelete || props.mode === "move" || props.mode === "move-category"}
              inputMode="numeric"
              maxLength={12}
              type="password"
              value={props.pin}
              onChange={(event) => props.onPinChange(event.target.value)}
            />
          </Field>
        )}
        {props.status ? <InlineNotice message={props.status} tone="error" /> : null}
      </div>
      <div className="modal-actions">
        <Button disabled={props.busy} onClick={props.onClose}>Cancel</Button>
        <Button
          busy={props.busy}
          data-modal-submit
          disabled={!contentReady || !pinReady}
          onClick={submit}
          variant={isDelete ? "danger" : "primary"}
        >
          {config.actionLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function projectModalConfig(props: {
  mode: Exclude<AutomationProjectModal, null>;
  projectTarget: AutomationStudioProject | null;
  categoryTarget: AutomationStudioProjectCategory | null;
}): { title: string; description: string; actionLabel: string; consequence: string } {
  const projectName = props.projectTarget?.name ?? "this project";
  const categoryName = props.categoryTarget?.name ?? "this category";
  const configs = {
    create: { title: "Create project", description: "Create a workspace for Flows, recordings, runtime history, and settings.", actionLabel: "Create project", consequence: "" },
    rename: { title: "Edit project", description: `Update the name and description for ${projectName}.`, actionLabel: "Save changes", consequence: "" },
    delete: { title: "Delete project", description: `Permanently delete ${projectName}.`, actionLabel: "Delete project", consequence: "The project hierarchy, workspace settings, Flows, recordings, and runtime history will be deleted." },
    move: { title: "Move project", description: `Move ${projectName} to a different category.`, actionLabel: "Move project", consequence: "" },
    "create-category": { title: "Create category", description: "Add a category for organizing projects.", actionLabel: "Create category", consequence: "" },
    "rename-category": { title: "Rename category", description: `Update the display name for ${categoryName}.`, actionLabel: "Save changes", consequence: "" },
    "delete-category": { title: "Delete category", description: `Delete ${categoryName} without deleting its projects.`, actionLabel: "Delete category", consequence: "Projects in this category will move to Uncategorized." },
    "move-category": { title: "Reorder category", description: `Move ${categoryName} in the project browser.`, actionLabel: "Move category", consequence: "" }
  } satisfies Record<Exclude<AutomationProjectModal, null>, { title: string; description: string; actionLabel: string; consequence: string }>;
  return configs[props.mode];
}

export function projectGridSections(projects: AutomationStudioProject[], categories: AutomationStudioProjectCategory[]): Array<{
  id: string;
  name: string;
  category: AutomationStudioProjectCategory | null;
  projects: AutomationStudioProject[];
}> {
  const sections = categories.map((category) => ({
    id: category.id,
    name: category.name,
    category,
    projects: projects.filter((project) => project.categoryId === category.id)
  }));
  return [
    ...sections,
    {
      id: "uncategorized",
      name: "Uncategorized",
      category: null,
      projects: projects.filter((project) => !project.categoryId || !categories.some((category) => category.id === project.categoryId))
    }
  ].filter((section) => section.category || section.projects.length || !categories.length);
}

export function moveCategoryId(categoryIds: string[], categoryId: string, targetCategoryId: string): string[] {
  const withoutDragged = categoryIds.filter((id) => id !== categoryId);
  const targetIndex = withoutDragged.indexOf(targetCategoryId);
  if (targetIndex < 0) return categoryIds;
  return [...withoutDragged.slice(0, targetIndex), categoryId, ...withoutDragged.slice(targetIndex)];
}
