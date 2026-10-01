"use client";

import { ChevronRight, FolderPlus, GitBranch, Workflow } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Field, Modal, VisualAlert } from "../../programs/shared-ui";
import { AUTOMATION_IDENTITY_ACCESS_HREF } from "../authorization";
import { automationHierarchyNodeIsSubflowCategory, automationHierarchyNodeIsSubflowRoot } from "./capabilities";
import { automationHierarchyCategoryLabel, type AutomationCreatableHierarchyKind, type AutomationHierarchyNode } from "./contracts";
import {
  automationHierarchyDialogSubmission,
  type AutomationHierarchyDialogEvent,
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
  const owner = useRef({ store: props.store, generation: 0, mounted: false, execute: props.execute });
  if (owner.current.store !== props.store) {
    owner.current.store = props.store;
    owner.current.generation++;
  }
  owner.current.execute = props.execute;
  useLayoutEffect(() => {
    owner.current.mounted = true;
    return () => { owner.current.mounted = false; };
  }, []);
  if (!transaction) return null;
  const generation = owner.current.generation;
  const current = () => owner.current.mounted && owner.current.generation === generation
    && owner.current.store === props.store && props.store.getSnapshot()?.transactionId === transaction.transactionId;
  const editable = () => current() && props.store.getSnapshot()?.status !== "submitting";
  const dispatch = (event: AutomationHierarchyDialogEvent) => { if (editable()) props.store.dispatch(event); };
  const close = () => { if (editable()) props.store.close(); };
  const busy = transaction.status === "submitting";
  const parent = transaction.kind === "create" && transaction.parentId ? nodeById.get(transaction.parentId) ?? null : null;
  const subflowParent = Boolean(parent && (automationHierarchyNodeIsSubflowRoot(parent) || automationHierarchyNodeIsSubflowCategory(parent)));
  const folderOptions = transaction.kind === "create"
    ? props.nodes.filter((node) => node.kind === "folder" && (subflowParent
      ? node.flowId === parent?.flowId && (automationHierarchyNodeIsSubflowRoot(node) || automationHierarchyNodeIsSubflowCategory(node))
      : node.category === transaction.category))
    : [];
  const submit = () => {
    if (!editable()) return;
    return submitAutomationHierarchyDialog(props.store, owner.current.execute, { transactionId: transaction.transactionId, canDispatch: current });
  };
  const title = transaction.kind === "delete"
    ? "Delete item"
    : transaction.step === "type"
      ? subflowParent ? "Add to Reusable parts" : "Add to " + automationHierarchyCategoryLabel(transaction.category)
      : "Create " + (subflowParent && transaction.createKind === "folder" ? "Folder" : transaction.createKind === "subflow" ? "Reusable part" : transaction.createKind);
  return (
    <Modal title={title} busy={busy} closeOnEscape={!busy} onClose={close}>
      {transaction.error ? <VisualAlert tone="error" title="Hierarchy action needs attention" message={transaction.error} /> : null}
      {transaction.kind === "create" && transaction.step === "type" ? <div className="automation-hierarchy-create">
        <div className="automation-create-type-grid" role="list" aria-label="Choose item type">
          {([
            subflowParent ? { kind: "subflow" as const, label: "Reusable part", icon: Workflow, detail: "Create a runnable piece of this automation that a path can send a run to." } : null,
            { kind: "folder" as const, label: "Folder", icon: FolderPlus, detail: "Organize items inside " + (subflowParent ? "Reusable parts" : automationHierarchyCategoryLabel(transaction.category)) + "." },
            !subflowParent && transaction.category === "flow" ? { kind: "flow" as const, label: "Flow", icon: GitBranch, detail: "Create a new top-level automation Flow." } : null
          ].filter((item): item is { kind: AutomationCreatableHierarchyKind; label: string; icon: typeof Workflow; detail: string } => Boolean(item))).map((item) => {
            const Icon = item.icon;
            return <button key={item.kind} className="automation-create-type-card" disabled={busy} onClick={() => dispatch({ type: "set-create-kind", createKind: item.kind })} type="button">
              <span className="automation-create-type-icon"><Icon size={19} aria-hidden /></span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <ChevronRight className="automation-create-type-chevron" size={17} aria-hidden />
            </button>;
          })}
        </div>
        <div className="modal-actions"><button className="button" disabled={busy} onClick={close} type="button">Cancel</button></div>
      </div> : transaction.kind === "create" ? <div className="automation-hierarchy-create automation-hierarchy-create-form">
        <div className="automation-hierarchy-create-heading">
          <span className="automation-create-type-icon">{transaction.createKind === "subflow" ? <Workflow size={19} aria-hidden /> : transaction.createKind === "folder" ? <FolderPlus size={19} aria-hidden /> : <GitBranch size={19} aria-hidden />}</span>
          <div><strong>{transaction.createKind === "subflow" ? "New reusable part" : transaction.createKind === "folder" ? "New folder" : "New Flow"}</strong><span>{subflowParent ? "Reusable parts" : automationHierarchyCategoryLabel(transaction.category)}</span></div>
        </div>
        <div className="automation-hierarchy-create-fields">
          <Field label="Name"><input autoComplete="off" autoFocus disabled={busy} name="automation-hierarchy-item-name" value={transaction.name} onChange={(event) => dispatch({ type: "set-name", name: event.target.value })} placeholder={transaction.createKind === "subflow" ? "Reusable part name" : transaction.createKind === "folder" ? "Folder name" : "Flow name"} /></Field>
          {transaction.createKind === "flow" ? <Field label="Flow preset"><select disabled={busy} value={transaction.flowOrigin} onChange={(event) => dispatch({ type: "set-flow-origin", flowOrigin: event.target.value as AutomationHierarchyFlowOrigin })}><option value="blank">Blank visual Flow</option><option value="deterministic">Deterministic workflow</option><option value="recorded">Recorded automation</option><option value="integration">Integration Flow</option><option value="scheduled">Scheduled Flow</option><option value="api-endpoint">API endpoint</option><option value="reusable">Reusable component</option></select></Field> : null}
          <Field label="Location"><select disabled={busy} value={transaction.parentId ?? ""} onChange={(event) => dispatch({ type: "set-parent", parentId: event.target.value || null })}>{subflowParent ? null : <option value="">{automationHierarchyCategoryLabel(transaction.category)}</option>}{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></Field>
        </div>
        <div className="modal-actions">
          <button className="button" disabled={transaction.status === "submitting"} onClick={() => dispatch({ type: "set-create-step", step: "type" })} type="button">Back</button>
          <button className="button" disabled={transaction.status === "submitting"} onClick={close} type="button">Cancel</button>
          <button className="button button-primary" disabled={transaction.status === "submitting" || !transaction.name.trim()} onClick={() => void submit()} type="button">Create</button>
        </div>
      </div> : <>
        <VisualAlert tone="warning" title={"Delete " + transaction.node.label + "?"} message="This removes the selected item and its contained hierarchy items." />
        <Field label="Security PIN"><input autoComplete="off" autoFocus disabled={busy} inputMode="numeric" name="automation-hierarchy-authorization-pin" type="password" value={transaction.authorizationPin} onChange={(event) => dispatch({ type: "set-pin", authorizationPin: event.target.value })} /></Field>
        <p className="automation-router-modal-intro">Deleting is the one thing here that asks for your PIN. No PIN yet? <a href={AUTOMATION_IDENTITY_ACCESS_HREF}>Set one up in Account and access</a>.</p>
        <div className="modal-actions">
          <button className="button" disabled={transaction.status === "submitting"} onClick={close} type="button">Cancel</button>
          <button className="button danger" disabled={transaction.status === "submitting" || transaction.authorizationPin.length < 4} onClick={() => void submit()} type="button">Delete</button>
        </div>
      </>}
    </Modal>
  );
});
export async function submitAutomationHierarchyDialog(
  store: AutomationHierarchyDialogStore,
  execute: (transaction: AutomationHierarchyDialogTransaction) => Promise<{ ok: boolean; error?: string }>,
  context?: { transactionId: number; canDispatch(): boolean }
): Promise<{ ok: boolean; error?: string }> {
  const transaction = store.getSnapshot();
  if (!transaction) return { ok: false, error: "No hierarchy action is open." };
  const notSubmitted = { ok: false, error: "This hierarchy action was not submitted. Review the draft before submitting." };
  if (context && (context.transactionId !== transaction.transactionId || !context.canDispatch())) return notSubmitted;
  if (transaction.status === "submitting") return { ok: false, error: "This hierarchy action is already being submitted." };
  const submission = automationHierarchyDialogSubmission(transaction);
  if (!submission.ok) {
    store.dispatch({ type: "submit-failed", error: submission.error });
    return submission;
  }
  store.dispatch({ type: "submit-started" });
  const ownsPending = () => {
    const current = store.getSnapshot();
    return current?.transactionId === transaction.transactionId && current.status === "submitting";
  };
  if (!ownsPending()) return notSubmitted;
  if (context && !context.canDispatch()) {
    store.dispatch({ type: "submit-failed", error: notSubmitted.error });
    return notSubmitted;
  }
  const uncertainty = "The hierarchy action's outcome was not confirmed. It may have completed. Check the hierarchy before submitting again.";
  let result: { ok: boolean; error?: string };
  try {
    const received: unknown = await execute(submission.transaction);
    if (!received || typeof received !== "object" || !("ok" in received) || typeof received.ok !== "boolean") result = { ok: false, error: uncertainty };
    else if (received.ok) result = { ok: true };
    else result = { ok: false, error: "error" in received && typeof received.error === "string" && received.error.trim() ? received.error : uncertainty };
  } catch {
    result = { ok: false, error: uncertainty };
  }
  // Issued work belongs to its captured store transaction, even if its UI retires.
  if (ownsPending()) {
    if (result.ok) store.close();
    else store.dispatch({ type: "submit-failed", error: result.error ?? uncertainty });
  }
  return result;
}
