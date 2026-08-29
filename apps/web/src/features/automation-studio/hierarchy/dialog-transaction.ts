import type {
  AutomationCreatableHierarchyKind,
  AutomationHierarchyCategory,
  AutomationHierarchyCreateAction,
  AutomationHierarchyDeleteAction,
  AutomationHierarchyNode
} from "./contracts";
import { automationHierarchyNodeIsSubflowCategory, automationHierarchyNodeIsSubflowRoot } from "./capabilities";

export type AutomationHierarchyFlowOrigin = "blank" | "deterministic" | "recorded" | "integration" | "scheduled" | "api-endpoint" | "reusable";
export type AutomationHierarchyDialogStatus = "editing" | "submitting" | "failed";

type AutomationHierarchyDialogBase = {
  transactionId: number;
  authorizationPin: string;
  error: string;
  status: AutomationHierarchyDialogStatus;
};

export type AutomationHierarchyCreateDialogTransaction = AutomationHierarchyDialogBase & {
  kind: "create";
  action: AutomationHierarchyCreateAction;
  category: AutomationHierarchyCategory;
  createKind: AutomationCreatableHierarchyKind;
  step: "type" | "details";
  flowOrigin: AutomationHierarchyFlowOrigin;
  name: string;
  parentId: string | null;
};

export type AutomationHierarchyDeleteDialogTransaction = AutomationHierarchyDialogBase & {
  kind: "delete";
  action: AutomationHierarchyDeleteAction;
  node: AutomationHierarchyNode;
};

export type AutomationHierarchyDialogTransaction =
  | AutomationHierarchyCreateDialogTransaction
  | AutomationHierarchyDeleteDialogTransaction;

export type AutomationHierarchyDialogEvent =
  | { type: "set-create-kind"; createKind: AutomationCreatableHierarchyKind }
  | { type: "set-create-step"; step: "type" | "details" }
  | { type: "set-flow-origin"; flowOrigin: AutomationHierarchyFlowOrigin }
  | { type: "set-name"; name: string }
  | { type: "set-parent"; parentId: string | null }
  | { type: "set-pin"; authorizationPin: string }
  | { type: "submit-started" }
  | { type: "submit-failed"; error: string }
  | { type: "resume-editing" };

let nextHierarchyDialogTransactionId = 1;

export function createAutomationHierarchyDialogTransaction(input: {
  action: AutomationHierarchyCreateAction | AutomationHierarchyDeleteAction;
  parent?: AutomationHierarchyNode | null;
}): AutomationHierarchyDialogTransaction {
  const transactionId = nextHierarchyDialogTransactionId++;
  if (input.action.action === "delete") {
    return {
      transactionId,
      kind: "delete",
      action: input.action,
      node: input.action.node,
      authorizationPin: "",
      error: "",
      status: "editing"
    };
  }
  const parent = input.parent ?? null;
  const category = input.action.category ?? parent?.category ?? "flow";
  const createsSubflow = Boolean(parent && (
    automationHierarchyNodeIsSubflowRoot(parent)
    || automationHierarchyNodeIsSubflowCategory(parent)
  ));
  return {
    transactionId,
    kind: "create",
    action: input.action,
    category,
    createKind: createsSubflow ? "subflow" : category === "flow" ? "flow" : "folder",
    step: "type",
    flowOrigin: "blank",
    name: "",
    parentId: input.action.parentId,
    authorizationPin: "",
    error: "",
    status: "editing"
  };
}

export function reduceAutomationHierarchyDialogTransaction(
  current: AutomationHierarchyDialogTransaction,
  event: AutomationHierarchyDialogEvent
): AutomationHierarchyDialogTransaction {
  if (event.type === "set-pin") {
    return { ...current, authorizationPin: digits(event.authorizationPin), error: "", status: "editing" };
  }
  if (event.type === "submit-started") return { ...current, error: "", status: "submitting" };
  if (event.type === "submit-failed") return { ...current, error: event.error, status: "failed" };
  if (event.type === "resume-editing") return { ...current, error: "", status: "editing" };
  if (current.kind !== "create") return current;
  if (event.type === "set-create-kind") return { ...current, createKind: event.createKind, step: "details", error: "", status: "editing" };
  if (event.type === "set-create-step") return { ...current, step: event.step, error: "", status: "editing" };
  if (event.type === "set-flow-origin") return { ...current, flowOrigin: event.flowOrigin, error: "", status: "editing" };
  if (event.type === "set-name") return { ...current, name: event.name, error: "", status: "editing" };
  if (event.type === "set-parent") return { ...current, parentId: event.parentId, error: "", status: "editing" };
  return current;
}

export type AutomationHierarchyDialogSubmission =
  | { ok: true; transaction: AutomationHierarchyDialogTransaction }
  | { ok: false; error: string };

export function automationHierarchyDialogSubmission(
  transaction: AutomationHierarchyDialogTransaction
): AutomationHierarchyDialogSubmission {
  if (transaction.status === "submitting") return { ok: false, error: "This hierarchy action is already being submitted." };
  if (transaction.authorizationPin.length < 4) return { ok: false, error: "Enter your PIN before changing hierarchy items." };
  if (transaction.kind === "create" && !transaction.name.trim()) return { ok: false, error: "Name is required." };
  return {
    ok: true,
    transaction: transaction.kind === "create"
      ? { ...transaction, name: transaction.name.trim(), error: "" }
      : { ...transaction, error: "" }
  };
}

function digits(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 12);
}