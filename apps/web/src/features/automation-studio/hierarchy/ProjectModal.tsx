"use client";

import { Field, KeyValue, Modal, StatusText, VisualAlert } from "../../programs/shared-ui";
import type { CurrentUser } from "../../programs/types";
import type { AutomationProjectModal, AutomationStudioProject, AutomationStudioProjectCategory } from "./model";

export function AutomationProjectModalView(props: {
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
  const pinReady = Boolean(props.currentUser.pinConfigured) && props.pin.length >= 4;
  const pinMessage = props.currentUser.pinConfigured ? "Enter your user security PIN to authorize this change." : "Your user needs a security PIN before project editing actions are allowed.";
  const pinField = (
    <>
      <VisualAlert tone="warning" title="PIN required" message={pinMessage} />
      <Field label="Security PIN"><input autoFocus={props.mode === "delete" || props.mode === "delete-category" || props.mode === "move" || props.mode === "move-category"} inputMode="numeric" value={props.pin} onChange={(event) => props.onPinChange(event.target.value)} /></Field>
    </>
  );
  if (props.mode === "delete") {
    return (
      <Modal title="Delete Project" onClose={props.onClose}>
        <VisualAlert tone="warning" title="Delete project" message={`Delete ${props.projectTarget?.name ?? "this project"} and all saved hierarchy/layout state?`} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary danger-action" disabled={!pinReady} onClick={props.onDelete} type="button">Delete Project</button></div>
      </Modal>
    );
  }
  if (props.mode === "move") {
    return (
      <Modal title="Move Project" onClose={props.onClose}>
        <KeyValue rows={[["Project", props.projectTarget?.name ?? "Project"], ["Destination", props.categoryTarget?.name ?? "Uncategorized"]]} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!pinReady} onClick={props.onMove} type="button">Move Project</button></div>
      </Modal>
    );
  }
  if (props.mode === "create-category" || props.mode === "rename-category") {
    return (
      <Modal title={props.mode === "create-category" ? "Create Category" : "Rename Category"} onClose={props.onClose}>
        <Field label="Category name"><input autoFocus value={props.categoryName} onChange={(event) => props.onCategoryNameChange(event.target.value)} /></Field>
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!props.categoryName.trim() || !pinReady} onClick={props.mode === "create-category" ? props.onCreateCategory : props.onRenameCategory} type="button">{props.mode === "create-category" ? "Create Category" : "Save Category"}</button></div>
      </Modal>
    );
  }
  if (props.mode === "delete-category") {
    return (
      <Modal title="Delete Category" onClose={props.onClose}>
        <VisualAlert tone="warning" title="Delete category" message={`Delete ${props.categoryTarget?.name ?? "this category"}? Projects in it will move to Uncategorized.`} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary danger-action" disabled={!pinReady} onClick={props.onDeleteCategory} type="button">Delete Category</button></div>
      </Modal>
    );
  }
  if (props.mode === "move-category") {
    return (
      <Modal title="Move Category" onClose={props.onClose}>
        <KeyValue rows={[["Category", props.categoryTarget?.name ?? "Category"], ["Action", "Reorder project category grid"]]} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!pinReady} onClick={props.onMoveCategory} type="button">Move Category</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={props.mode === "rename" ? "Rename Project" : "Create Project"} onClose={props.onClose}>
      <Field label="Project name"><input autoFocus value={props.name} onChange={(event) => props.onNameChange(event.target.value)} /></Field>
      <Field label="Description"><input value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} /></Field>
      {pinField}
      <StatusText value={props.status} />
      <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!props.name.trim() || !pinReady} onClick={props.mode === "rename" ? props.onRename : props.onCreate} type="button">{props.mode === "rename" ? "Save Project" : "Create Project"}</button></div>
    </Modal>
  );
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
