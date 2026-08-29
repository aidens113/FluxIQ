import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import type { AutomationProjectApi } from "./project-api";

export type ProjectAuthorization = { authorizationPin: string };

export function createAutomationProject(api: AutomationProjectApi, input: { name: string; description: string; categoryId: string | null } & ProjectAuthorization) {
  return api.post<{ project: AutomationStudioProject }>("create-project", input);
}

export function renameAutomationProject(api: AutomationProjectApi, input: { projectId: string; name: string; description: string } & ProjectAuthorization) {
  return api.post<{ project: AutomationStudioProject }>("update-project", input);
}

export function moveAutomationProject(api: AutomationProjectApi, input: { projectId: string; categoryId: string | null } & ProjectAuthorization) {
  return api.post<{ project: AutomationStudioProject }>("update-project", input);
}

export function deleteAutomationProject(api: AutomationProjectApi, input: { projectId: string } & ProjectAuthorization) {
  return api.post<{ deletedProjectId: string }>("delete-project", input);
}

export function createAutomationProjectCategory(api: AutomationProjectApi, input: { name: string } & ProjectAuthorization) {
  return api.post<{ category: AutomationStudioProjectCategory }>("create-project-category", input);
}

export function renameAutomationProjectCategory(api: AutomationProjectApi, input: { categoryId: string; name: string } & ProjectAuthorization) {
  return api.post<{ category: AutomationStudioProjectCategory }>("update-project-category", input);
}

export function deleteAutomationProjectCategory(api: AutomationProjectApi, input: { categoryId: string } & ProjectAuthorization) {
  return api.post<{ deletedCategoryId: string }>("delete-project-category", input);
}

export function reorderAutomationProjectCategories(api: AutomationProjectApi, input: { categoryIds: string[] } & ProjectAuthorization) {
  return api.post<{ categories: AutomationStudioProjectCategory[] }>("reorder-project-categories", input);
}