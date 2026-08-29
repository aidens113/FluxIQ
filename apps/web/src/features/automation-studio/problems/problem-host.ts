import type { AutomationProblemSource } from "./problem-model";

export type ProblemsValidationStatus = "loading" | "ready" | "empty" | "error" | "permission-denied" | "stale";
export type ProblemsViewActivity = "active" | "inactive";

export type ProblemsValidationState = {
  status: ProblemsValidationStatus;
  message?: string;
  validatedAt?: number | null;
};

export type ProblemsCurrentObject = {
  id: string;
  label: string;
};

export type ProblemsViewHostModel = {
  problems: readonly AutomationProblemSource[];
  currentObject?: ProblemsCurrentObject | null;
  currentObjectId?: string | null;
  currentObjectLabel?: string;
  validation?: ProblemsValidationState;
  activity?: ProblemsViewActivity;
};

export type ProblemsViewHostCommands = {
  onOpenProblem?(problem: AutomationProblemSource): void;
  onRequestValidation?(): void;
};

export type ProblemsViewHostProps = ProblemsViewHostModel & ProblemsViewHostCommands;

export type ResolvedProblemsHostState = {
  status: ProblemsValidationStatus;
  message: string | null;
  currentObject: ProblemsCurrentObject | null;
  active: boolean;
  canRequestValidation: boolean;
};

export function resolveProblemsHostState(
  model: ProblemsViewHostModel,
  commands: ProblemsViewHostCommands = {}
): ResolvedProblemsHostState {
  const currentObject = model.currentObject ?? (
    model.currentObjectId
      ? { id: model.currentObjectId, label: model.currentObjectLabel?.trim() || "Current object" }
      : null
  );
  const active = model.activity !== "inactive";
  const status = model.validation?.status ?? (model.problems.length ? "ready" : "empty");
  const message = model.validation?.message?.trim() || defaultStateMessage(status, active);
  return {
    status,
    message,
    currentObject,
    active,
    canRequestValidation: active
      && typeof commands.onRequestValidation === "function"
      && status !== "loading"
      && status !== "permission-denied"
  };
}

function defaultStateMessage(status: ProblemsValidationStatus, active: boolean): string | null {
  if (!active && (status === "loading" || status === "stale")) return "Validation is paused while this view is inactive.";
  if (status === "loading") return "Checking the current project snapshot.";
  if (status === "error") return "Validation could not be completed.";
  if (status === "permission-denied") return "You do not have permission to validate this project.";
  if (status === "stale") return "These results may be out of date.";
  return null;
}
