"use client";

import { useRef, type DragEvent } from "react";
import type { CurrentUser } from "../../programs/types";
import { AutomationProjectBrowser } from "../hierarchy/ProjectBrowser";
import { AutomationProjectModalView, moveCategoryId } from "../hierarchy/ProjectModal";
import type { AutomationProjectModal, AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import type { AutomationProjectCatalogStore } from "../stores";
import { useAutomationStoreSelector } from "../stores";
import type { AutomationStudioUiStore } from "../workspace/studio-ui-store";
import {
  createAutomationProject,
  createAutomationProjectCategory,
  deleteAutomationProject,
  deleteAutomationProjectCategory,
  moveAutomationProject,
  renameAutomationProject,
  renameAutomationProjectCategory,
  reorderAutomationProjectCategories
} from "./project-catalog-commands";
import type { AutomationProjectApi } from "./project-api";

export function AutomationProjectCatalogSurface(props: {
  api: AutomationProjectApi;
  catalog: AutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>;
  currentUser: CurrentUser;
  onOpenProject(projectId: string): void;
  refreshProjects(): void;
  studioUiStore: AutomationStudioUiStore;
}) {
  const catalog = useAutomationStoreSelector(props.catalog, (state) => state, undefined, sameCatalogState);
  const dragOverCategoryId = useAutomationStoreSelector(props.studioUiStore, (state) => state.dragOverCategoryId, "dragOverCategoryId");
  const beginProjectModal = (mode: Exclude<AutomationProjectModal, null>, project?: AutomationStudioProject, category?: AutomationStudioProjectCategory) => {
    props.studioUiStore.patch({
      projectModal: mode,
      projectTarget: project ?? null,
      categoryTarget: category ?? null,
      projectName: project?.name ?? "",
      projectDescription: project?.description ?? "",
      categoryName: category?.name ?? "",
      projectPin: "",
      projectStatus: ""
    });
  };
  const requestProjectDrop = (projectId: string, categoryId: string | null) => {
    const project = catalog.projects.find((item) => item.id === projectId);
    if (!project || (project.categoryId ?? null) === categoryId) return;
    props.studioUiStore.patch({
      pendingProjectMove: { projectId, categoryId },
      projectTarget: project,
      categoryTarget: catalog.categories.find((category) => category.id === categoryId) ?? null,
      projectModal: "move",
      projectPin: "",
      projectStatus: ""
    });
  };
  const requestCategoryDrop = (categoryId: string, targetCategoryId: string) => {
    if (categoryId === targetCategoryId) return;
    const category = catalog.categories.find((item) => item.id === categoryId);
    if (!category || !catalog.categories.some((item) => item.id === targetCategoryId)) return;
    props.studioUiStore.patch({
      pendingCategoryMove: { categoryId, targetCategoryId },
      categoryTarget: category,
      projectModal: "move-category",
      projectPin: "",
      projectStatus: ""
    });
  };
  const handleDrop = (event: DragEvent<HTMLElement>, categoryId: string | null) => {
    event.preventDefault();
    props.studioUiStore.patch({ dragOverCategoryId: null });
    const projectId = event.dataTransfer.getData("application/x-fluxiq-project");
    if (projectId) return requestProjectDrop(projectId, categoryId);
    const draggedCategoryId = event.dataTransfer.getData("application/x-fluxiq-project-category");
    if (draggedCategoryId && categoryId) requestCategoryDrop(draggedCategoryId, categoryId);
  };

  return <>
    <AutomationProjectBrowser
      categories={[...catalog.categories]}
      dragOverCategoryId={dragOverCategoryId}
      loaded={catalog.loaded}
      projects={[...catalog.projects]}
      status={catalog.error ?? ""}
      onCreateCategory={() => beginProjectModal("create-category")}
      onCreateProject={(category) => beginProjectModal("create", undefined, category)}
      onDeleteCategory={(category) => beginProjectModal("delete-category", undefined, category)}
      onDeleteProject={(project) => beginProjectModal("delete", project)}
      onDragLeaveCategory={() => props.studioUiStore.patch({ dragOverCategoryId: null })}
      onDragOverCategory={(categoryId) => props.studioUiStore.patch({ dragOverCategoryId: categoryId })}
      onDrop={handleDrop}
      onOpenProject={props.onOpenProject}
      onRefresh={() => {
        props.catalog.setLoaded(false);
        props.refreshProjects();
      }}
      onRenameCategory={(category) => beginProjectModal("rename-category", undefined, category)}
      onRenameProject={(project) => beginProjectModal("rename", project)}
    />
    <AutomationProjectModalBoundary {...props} />
  </>;
}

function AutomationProjectModalBoundary(props: {
  api: AutomationProjectApi;
  catalog: AutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>;
  currentUser: CurrentUser;
  onOpenProject(projectId: string): void;
  studioUiStore: AutomationStudioUiStore;
}) {
  const ui = useAutomationStoreSelector(props.studioUiStore, selectProjectModalUi, "project-ui", shallowRecordSame);
  const busyRef = useRef(false);
  if (!ui.projectModal) return null;
  const close = () => {
    if (!busyRef.current) props.studioUiStore.patch({ projectModal: null });
  };
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    props.studioUiStore.patch({ projectActionBusy: true, projectStatus: "" });
    try {
      await operation();
    } finally {
      busyRef.current = false;
      props.studioUiStore.patch({ projectActionBusy: false });
    }
  };
  const finish = () => props.studioUiStore.patch({
    projectModal: null,
    projectTarget: null,
    categoryTarget: null,
    projectName: "",
    projectDescription: "",
    categoryName: "",
    projectPin: "",
    projectStatus: "",
    pendingProjectMove: null,
    pendingCategoryMove: null
  });
  const failure = (message: string): void => {
    props.studioUiStore.patch({ projectStatus: message });
  };
  const create = () => run(async () => {
    const name = ui.projectName.trim();
    if (!name) return failure("Project name is required.");
    const result = await createAutomationProject(props.api, {
      name,
      description: ui.projectDescription.trim(),
      categoryId: ui.categoryTarget?.id ?? null,
      authorizationPin: ui.projectPin
    });
    if (!result.ok || !result.payload?.project) return failure(result.error ?? "Project could not be created.");
    const project = result.payload.project;
    props.catalog.setProjects([project, ...props.catalog.getState().projects.filter((item) => item.id !== project.id)]);
    finish();
    props.onOpenProject(project.id);
  });
  const rename = () => run(async () => {
    if (!ui.projectTarget) return;
    const name = ui.projectName.trim();
    if (!name) return failure("Project name is required.");
    const result = await renameAutomationProject(props.api, {
      projectId: ui.projectTarget.id,
      name,
      description: ui.projectDescription.trim(),
      authorizationPin: ui.projectPin
    });
    if (!result.ok || !result.payload?.project) return failure(result.error ?? "Project could not be renamed.");
    props.catalog.setProjects(props.catalog.getState().projects.map((project) => project.id === ui.projectTarget!.id ? result.payload!.project : project));
    finish();
  });
  const remove = () => run(async () => {
    if (!ui.projectTarget) return;
    const result = await deleteAutomationProject(props.api, { projectId: ui.projectTarget.id, authorizationPin: ui.projectPin });
    if (!result.ok) return failure(result.error ?? "Project could not be deleted.");
    props.catalog.setProjects(props.catalog.getState().projects.filter((project) => project.id !== ui.projectTarget!.id));
    finish();
  });
  const move = () => run(async () => {
    if (!ui.pendingProjectMove) return;
    const result = await moveAutomationProject(props.api, { ...ui.pendingProjectMove, authorizationPin: ui.projectPin });
    if (!result.ok || !result.payload?.project) return failure(result.error ?? "Project could not be moved.");
    props.catalog.setProjects(props.catalog.getState().projects.map((project) => project.id === ui.pendingProjectMove!.projectId ? result.payload!.project : project));
    finish();
  });
  const createCategory = () => run(async () => {
    const name = ui.categoryName.trim();
    if (!name) return failure("Category name is required.");
    const result = await createAutomationProjectCategory(props.api, { name, authorizationPin: ui.projectPin });
    if (!result.ok || !result.payload?.category) return failure(result.error ?? "Category could not be created.");
    props.catalog.setCategories([...props.catalog.getState().categories, result.payload.category].sort((left, right) => left.order - right.order));
    finish();
  });
  const renameCategory = () => run(async () => {
    if (!ui.categoryTarget) return;
    const name = ui.categoryName.trim();
    if (!name) return failure("Category name is required.");
    const result = await renameAutomationProjectCategory(props.api, { categoryId: ui.categoryTarget.id, name, authorizationPin: ui.projectPin });
    if (!result.ok || !result.payload?.category) return failure(result.error ?? "Category could not be renamed.");
    props.catalog.setCategories(props.catalog.getState().categories.map((category) => category.id === ui.categoryTarget!.id ? result.payload!.category : category).sort((left, right) => left.order - right.order));
    finish();
  });
  const deleteCategory = () => run(async () => {
    if (!ui.categoryTarget) return;
    const result = await deleteAutomationProjectCategory(props.api, { categoryId: ui.categoryTarget.id, authorizationPin: ui.projectPin });
    if (!result.ok) return failure(result.error ?? "Category could not be deleted.");
    const categoryId = ui.categoryTarget.id;
    props.catalog.transaction(() => {
      props.catalog.setCategories(props.catalog.getState().categories.filter((category) => category.id !== categoryId));
      props.catalog.setProjects(props.catalog.getState().projects.map((project) => project.categoryId === categoryId ? { ...project, categoryId: null, updatedAt: Date.now() } : project));
    });
    finish();
  });
  const moveCategory = () => run(async () => {
    if (!ui.pendingCategoryMove) return;
    const categoryIds = moveCategoryId(props.catalog.getState().categories.map((category) => category.id), ui.pendingCategoryMove.categoryId, ui.pendingCategoryMove.targetCategoryId);
    const result = await reorderAutomationProjectCategories(props.api, { categoryIds, authorizationPin: ui.projectPin });
    if (!result.ok || !result.payload?.categories) return failure(result.error ?? "Category could not be moved.");
    props.catalog.setCategories(result.payload.categories);
    finish();
  });

  return <AutomationProjectModalView
    busy={ui.projectActionBusy}
    categoryName={ui.categoryName}
    categoryTarget={ui.categoryTarget}
    currentUser={props.currentUser}
    description={ui.projectDescription}
    mode={ui.projectModal}
    name={ui.projectName}
    pin={ui.projectPin}
    projectTarget={ui.projectTarget}
    status={ui.projectStatus}
    onCategoryNameChange={(categoryName) => props.studioUiStore.patch({ categoryName })}
    onClose={close}
    onCreate={() => void create()}
    onCreateCategory={() => void createCategory()}
    onDelete={() => void remove()}
    onDeleteCategory={() => void deleteCategory()}
    onDescriptionChange={(projectDescription) => props.studioUiStore.patch({ projectDescription })}
    onMove={() => void move()}
    onMoveCategory={() => void moveCategory()}
    onNameChange={(projectName) => props.studioUiStore.patch({ projectName })}
    onPinChange={(value) => props.studioUiStore.patch({ projectPin: value.replace(/D/g, "") })}
    onRename={() => void rename()}
    onRenameCategory={() => void renameCategory()}
  />;
}

function selectProjectModalUi(state: ReturnType<AutomationStudioUiStore["getState"]>) {
  return {
    projectModal: state.projectModal,
    projectTarget: state.projectTarget,
    categoryTarget: state.categoryTarget,
    projectName: state.projectName,
    projectDescription: state.projectDescription,
    categoryName: state.categoryName,
    projectPin: state.projectPin,
    projectStatus: state.projectStatus,
    projectActionBusy: state.projectActionBusy,
    pendingProjectMove: state.pendingProjectMove,
    pendingCategoryMove: state.pendingCategoryMove
  };
}

function shallowRecordSame(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]));
}

function sameCatalogState(
  left: ReturnType<AutomationProjectCatalogStore["getState"]>,
  right: ReturnType<AutomationProjectCatalogStore["getState"]>
): boolean {
  return left.projects === right.projects
    && left.categories === right.categories
    && left.loaded === right.loaded
    && left.loading === right.loading
    && left.error === right.error;
}