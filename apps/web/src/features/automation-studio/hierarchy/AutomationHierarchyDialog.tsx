"use client";

import { ChevronRight, FolderPlus, GitBranch, Workflow } from "lucide-react";
import { memo, useMemo, useSyncExternalStore } from "react";
import { Field, Modal, StatusText, VisualAlert } from "../../programs/shared-ui";
import { automationHierarchyNodeIsSubflowCategory, automationHierarchyNodeIsSubflowRoot } from "./capabilities";
import { automationHierarchyCategoryLabel, type AutomationCreatableHierarchyKind, type AutomationHierarchyNode } from "./contracts";
import {
  automationHierarchyDialogSubmission,
  type AutomationHierarchyDialogTransaction,
  type AutomationHierarchyFlowOrigin
} from "./dialog-transaction";
import type { AutomationHierarchyDialogStore } from "./dialog-store";

export const AutomationHierarchyDialog = memo(function AutomationHierarchyDialog(props: {
  nodes: AutomationHierarchyNode[];
  store: AutomationHierarchyDialogStore;
  execute(transaction: AutomationHierarchyDialogTransaction): Promise<{ ok: boolean; error?: string }>;
}) {
  const transaction = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot);
  const nodeById = useMemo(() => new Map(props.nodes.map((node) => [node.id, node])), [props.nodes]);
  if (!transaction) return null;
  const parent = transaction.kind === "create" && transaction.parentId ? nodeById.get(transaction.parentId) ?? null : null;
  const subflowParent = Boolean(parent && (automationHierarchyNodeIsSubflowRoot(parent) || automationHierarchyNodeIsSubflowCategory(parent)));
  const folderOptions = transaction.kind === "create"
    ? props.nodes.filter((node) => node.kind === "folder" && (subflowParent
      ? node.flowId === parent?.flowId && (automationHierarchyNodeIsSubflowRoot(node) || automationHierarchyNodeIsSubflowCategory(node))
      : node.category === transaction.category))
    : [];
  const submit = () => submitAutomationHierarchyDialog(props.store, props.execute);
  const title = transaction.kind === "delete"
    ? "Delete item"
    : transaction.step === "type"
      ? subflowParent ? "Add to Subflows" : "Add to " + automationHierarchyCategoryLabel(transaction.category)
      : "Create " + (subflowParent && transaction.createKind === "folder" ? "Folder" : transaction.createKind === "subflow" ? "Subflow" : transaction.createKind);
  return (
    <Modal title={title} onClose={props.store.close}>
      {transaction.kind === "create" && transaction.step === "type" ? <div className="automation-hierarchy-create">
        <div className="automation-create-type-grid" role="list" aria-label="Choose item type">
          {([
            subflowParent ? { kind: "subflow" as const, label: "Subflow", icon: Workflow, detail: "Create an executable workflow that the Router can target." } : null,
            { kind: "folder" as const, label: "Folder", icon: FolderPlus, detail: "Organize items inside " + (subflowParent ? "Subflows" : automationHierarchyCategoryLabel(transaction.category)) + "." },
            !subflowParent && transaction.category === "flow" ? { kind: "flow" as const, label: "Flow", icon: GitBranch, detail: "Create a new top-level automation Flow." } : null
          ].filter((item): item is { kind: AutomationCreatableHierarchyKind; label: string; icon: typeof Workflow; detail: string } => Boolean(item))).map((item) => {
            const Icon = item.icon;
            return <button key={item.kind} className="automation-create-type-card" onClick={() => props.store.dispatch({ type: "set-create-kind", createKind: item.kind })} type="button">
              <span className="automation-create-type-icon"><Icon size={19} aria-hidden /></span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <ChevronRight className="automation-create-type-chevron" size={17} aria-hidden />
            </button>;
          })}
        </div>
        <div className="modal-actions"><button className="button" onClick={props.store.close} type="button">Cancel</button></div>
      </div> : transaction.kind === "create" ? <div className="automation-hierarchy-create automation-hierarchy-create-form">
        <div className="automation-hierarchy-create-heading">
          <span className="automation-create-type-icon">{transaction.createKind === "subflow" ? <Workflow size={19} aria-hidden /> : transaction.createKind === "folder" ? <FolderPlus size={19} aria-hidden /> : <GitBranch size={19} aria-hidden />}</span>
          <div><strong>{transaction.createKind === "subflow" ? "New subflow" : transaction.createKind === "folder" ? "New folder" : "New Flow"}</strong><span>{subflowParent ? "Subflows" : automationHierarchyCategoryLabel(transaction.category)}</span></div>
        </div>
        <div className="automation-hierarchy-create-fields">
          <Field label="Name"><input autoFocus value={transaction.name} onChange={(event) => props.store.dispatch({ type: "set-name", name: event.target.value })} placeholder={transaction.createKind === "subflow" ? "Subflow name" : transaction.createKind === "folder" ? "Folder name" : "Flow name"} /></Field>
          {transaction.createKind === "flow" ? <Field label="Flow preset"><select value={transaction.flowOrigin} onChange={(event) => props.store.dispatch({ type: "set-flow-origin", flowOrigin: event.target.value as AutomationHierarchyFlowOrigin })}><option value="blank">Blank visual Flow</option><option value="deterministic">Deterministic workflow</option><option value="recorded">Recorded automation</option><option value="integration">Integration Flow</option><option value="scheduled">Scheduled Flow</option><option value="api-endpoint">API endpoint</option><option value="reusable">Reusable component</option></select></Field> : null}
          <Field label="Location"><select value={transaction.parentId ?? ""} onChange={(event) => props.store.dispatch({ type: "set-parent", parentId: event.target.value || null })}>{subflowParent ? null : <option value="">{automationHierarchyCategoryLabel(transaction.category)}</option>}{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></Field>
          <Field label="Security PIN"><input inputMode="numeric" type="password" value={transaction.authorizationPin} onChange={(event) => props.store.dispatch({ type: "set-pin", authorizationPin: event.target.value })} placeholder="Enter PIN" /></Field>
        </div>
        <StatusText value={transaction.error} />
        <div className="modal-actions">
          <button className="button" disabled={transaction.status === "submitting"} onClick={() => props.store.dispatch({ type: "set-create-step", step: "type" })} type="button">Back</button>
          <button className="button" disabled={transaction.status === "submitting"} onClick={props.store.close} type="button">Cancel</button>
          <button className="button button-primary" disabled={transaction.status === "submitting" || transaction.authorizationPin.length < 4 || !transaction.name.trim()} onClick={() => void submit()} type="button">Create</button>
        </div>
      </div> : <>
        <VisualAlert tone="warning" title={"Delete " + transaction.node.label + "?"} message="This removes the selected item and its contained hierarchy items." />
        <Field label="Security PIN"><input autoFocus inputMode="numeric" type="password" value={transaction.authorizationPin} onChange={(event) => props.store.dispatch({ type: "set-pin", authorizationPin: event.target.value })} /></Field>
        <StatusText value={transaction.error} />
        <div className="modal-actions">
          <button className="button" disabled={transaction.status === "submitting"} onClick={props.store.close} type="button">Cancel</button>
          <button className="button danger" disabled={transaction.status === "submitting" || transaction.authorizationPin.length < 4} onClick={() => void submit()} type="button">Delete</button>
        </div>
      </>}
    </Modal>
  );
});
export async function submitAutomationHierarchyDialog(
  store: AutomationHierarchyDialogStore,
  execute: (transaction: AutomationHierarchyDialogTransaction) => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  const transaction = store.getSnapshot();
  if (!transaction) return { ok: false, error: "No hierarchy action is open." };
  if (transaction.status === "submitting") return { ok: false, error: "This hierarchy action is already being submitted." };
  const submission = automationHierarchyDialogSubmission(transaction);
  if (!submission.ok) {
    store.dispatch({ type: "submit-failed", error: submission.error });
    return submission;
  }
  store.dispatch({ type: "submit-started" });
  const result = await execute(submission.transaction);
  if (result.ok) store.close();
  else store.dispatch({ type: "submit-failed", error: result.error ?? "Hierarchy action failed." });
  return result;
}