"use client";

import { useState } from "react";
import { Field, InlineNotice, Modal } from "../../../programs/shared-ui";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import type {
  ProjectOverlayCommand,
  ProjectOverlayRequest
} from "./contracts";
import {
  useAutomationOverlaySelection,
  type AutomationStudioOverlayStore
} from "./overlay-state-store";

type ProjectDraft = {
  name: string;
  description: string;
  pin: string;
};

export function projectDraftForRequest(request: ProjectOverlayRequest): ProjectDraft {
  if (request.kind === "edit-project") {
    return {
      name: request.project.name,
      description: request.project.description ?? "",
      pin: ""
    };
  }
  if (request.kind === "rename-category") {
    return { name: request.category.name, description: "", pin: "" };
  }
  return { name: "", description: "", pin: "" };
}

export function projectCommandFromDraft(
  request: ProjectOverlayRequest,
  draft: ProjectDraft
): ProjectOverlayCommand {
  const common = { requestId: request.id, pin: draft.pin };
  switch (request.kind) {
    case "create-project":
      return {
        type: "project.create",
        ...common,
        name: draft.name.trim(),
        description: draft.description.trim(),
        categoryId: request.categoryId
      };
    case "edit-project":
      return {
        type: "project.update",
        ...common,
        projectId: request.project.id,
        name: draft.name.trim(),
        description: draft.description.trim()
      };
    case "delete-project":
      return { type: "project.delete", ...common, projectId: request.project.id };
    case "move-project":
      return {
        type: "project.move",
        ...common,
        projectId: request.project.id,
        categoryId: request.destination?.id ?? null
      };
    case "create-category":
      return { type: "project-category.create", ...common, name: draft.name.trim() };
    case "rename-category":
      return {
        type: "project-category.rename",
        ...common,
        categoryId: request.category.id,
        name: draft.name.trim()
      };
    case "delete-category":
      return { type: "project-category.delete", ...common, categoryId: request.category.id };
    case "move-category":
      return {
        type: "project-category.move",
        ...common,
        categoryId: request.category.id,
        beforeCategoryId: request.before.id
      };
  }
}

export function ProjectOverlaySubscriber(props: {
  dispatch: OverlayCommandDispatcher<ProjectOverlayCommand>;
  pinConfigured: boolean;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "project");
  if (!request) return null;
  return (
    <ProjectOverlaySurface
      dispatch={props.dispatch}
      key={request.id}
      onClose={() => props.store.close("project", request.id)}
      pinConfigured={props.pinConfigured}
      request={request}
    />
  );
}

export function ProjectOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<ProjectOverlayCommand>;
  onClose(): void;
  pinConfigured: boolean;
  request: ProjectOverlayRequest;
}) {
  const [draft, setDraft] = useState(() => projectDraftForRequest(props.request));
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);
  const copy = projectOverlayCopy(props.request);
  const needsName = props.request.kind === "create-project"
    || props.request.kind === "edit-project"
    || props.request.kind === "create-category"
    || props.request.kind === "rename-category";
  const ready = props.pinConfigured
    && draft.pin.length >= 4
    && (!needsName || Boolean(draft.name.trim()));

  async function confirm() {
    if (!ready) return;
    if (await execute(projectCommandFromDraft(props.request, draft))) props.onClose();
  }

  return (
    <Modal
      busy={status.pending}
      closeOnEscape={!status.pending}
      description={copy.description}
      onClose={props.onClose}
      title={copy.title}
    >
      <div className="dialog-form">
        {needsName ? (
          <Field label={props.request.kind.includes("category") ? "Category name" : "Project name"} required>
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name}
            />
          </Field>
        ) : null}
        {props.request.kind === "create-project" || props.request.kind === "edit-project" ? (
          <Field hint="Optional. This appears in project search results." label="Description">
            <textarea
              maxLength={500}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              value={draft.description}
            />
          </Field>
        ) : null}
        {copy.summary ? <InlineNotice message={copy.summary} tone={copy.danger ? "warning" : "info"} /> : null}
        {!props.pinConfigured ? (
          <InlineNotice message="Configure a security PIN before changing projects or categories." tone="error" />
        ) : (
          <Field hint="Use your current security PIN." label="Security PIN" required>
            <input
              autoComplete="off"
              inputMode="numeric"
              onChange={(event) => setDraft((current) => ({
                ...current,
                pin: event.target.value.replace(/\D/g, "").slice(0, 12)
              }))}
              type="password"
              value={draft.pin}
            />
          </Field>
        )}
        {status.error ? <InlineNotice message={status.error} tone="error" /> : null}
      </div>
      <div className="modal-actions">
        <button className="button" disabled={status.pending} onClick={props.onClose} type="button">Cancel</button>
        <button
          className={copy.danger ? "button danger" : "button button-primary"}
          data-modal-submit
          disabled={!ready || status.pending}
          onClick={() => void confirm()}
          type="button"
        >
          {status.pending ? "Working..." : copy.action}
        </button>
      </div>
    </Modal>
  );
}

function projectOverlayCopy(request: ProjectOverlayRequest) {
  switch (request.kind) {
    case "create-project":
      return { title: "Create project", description: "Create an Automation Studio workspace.", action: "Create project", danger: false, summary: "" };
    case "edit-project":
      return { title: "Edit project", description: `Update ${request.project.name}.`, action: "Save changes", danger: false, summary: "" };
    case "delete-project":
      return { title: "Delete project", description: `Permanently delete ${request.project.name}.`, action: "Delete project", danger: true, summary: "Its hierarchy, settings, Flows, recordings, and runtime history will be deleted." };
    case "move-project":
      return { title: "Move project", description: `Move ${request.project.name}.`, action: "Move project", danger: false, summary: `Destination: ${request.destination?.name ?? "Uncategorized"}` };
    case "create-category":
      return { title: "Create category", description: "Add a project category.", action: "Create category", danger: false, summary: "" };
    case "rename-category":
      return { title: "Rename category", description: `Update ${request.category.name}.`, action: "Save changes", danger: false, summary: "" };
    case "delete-category":
      return { title: "Delete category", description: `Delete ${request.category.name}.`, action: "Delete category", danger: true, summary: "Projects in this category will move to Uncategorized." };
    case "move-category":
      return { title: "Reorder category", description: `Move ${request.category.name}.`, action: "Move category", danger: false, summary: `Place before ${request.before.name}.` };
  }
}