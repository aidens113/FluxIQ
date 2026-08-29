"use client";

import { Combobox, DataTable, Field, Menu, Modal, StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, Copy, Info, ListChecks, MoreHorizontal, Search, Pencil, Plus, Power, Route, Trash2, Workflow, X } from "lucide-react";
import { JsonToggle, flowMapFallbackLabel, formatRuntimeTimestamp } from "../runtime";
import { commitAutomationStudioMutation, subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { readSubflowDirectoryUrlState, routerReferencesForSubflow, subflowReadiness, type SubflowDirectoryState } from "./subflow-directory-model";
import { useSubflowCommands, type SubflowCommands } from "./subflow-host";

export type SubflowsViewProps = { projectId: string | null; flow: any; onOpenSubflow?(flowId: string, subflowId: string, mode: "preview" | "new-window"): void };

export function SubflowsView(props: SubflowsViewProps) {
  const commands = useSubflowCommands();
  return <SubflowDirectoryContent {...props} commands={commands} />;
}

export function SubflowDirectoryContent(props: SubflowsViewProps & { commands: SubflowCommands }) {
  const flowId = props.flow?.flowId ?? "";
  const initialState = useMemo(() => readSubflowDirectoryUrlState(), []);
  const [subflows, setSubflows] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: initialState.limit, offset: initialState.offset, total: 0 });
  const [queryInput, setQueryInput] = useState(initialState.search);
  const [filters, setFilters] = useState({ search: initialState.search, status: initialState.status, role: initialState.role, sort: initialState.sort, direction: initialState.direction });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [router, setRouter] = useState<any | null>(null);
  const [saveAuthorizationOpen, setSaveAuthorizationOpen] = useState(false);
  const [saveAuthorizationPin, setSaveAuthorizationPin] = useState("");
  const [saveAuthorizationError, setSaveAuthorizationError] = useState("");
  const [routerLoaded, setRouterLoaded] = useState(false);
  const [subflowAction, setSubflowAction] = useState<null | { subflow: any; action: "rename" | "duplicate" | "enable" | "disable" | "archive" | "delete"; name: string; pin: string }>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const requestRef = useRef(0);
  const routerRequestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: queryInput.trim() })), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setSubflows([]);
    if (!props.projectId || !flowId) {
      setPage((current) => ({ ...current, offset: 0, total: 0 }));
      return;
    }
    void loadSubflows(page.offset);
  }, [props.projectId, flowId, filters.search, filters.status, filters.role, filters.sort, filters.direction, page.limit]);

  useEffect(() => {
    setRouter(null);
    setRouterLoaded(false);
    if (!props.projectId || !flowId) return;
    void loadRouter();
  }, [props.projectId, flowId]);

  useEffect(() => subscribeToAutomationStudioMutations(
    () => void loadSubflows(page.offset),
    { kinds: ["subflow.changed"], projectId: props.projectId, flowId }
  ), [props.projectId, flowId, page.offset, page.limit, filters]);


  const loadRouter = async () => {
    if (!props.projectId || !flowId) return;
    const requestId = ++routerRequestRef.current;
    const result = await props.commands.loadRouter({ projectId: props.projectId, flowId });
    if (requestId !== routerRequestRef.current) return;
    setRouter(result.ok ? result.payload?.router ?? null : null);
    setRouterLoaded(true);
  };

  const loadSubflows = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    const result = await props.commands.listSubflows({
      projectId: props.projectId,
      flowId,
      limit: page.limit,
      offset,
      search: filters.search,
      status: filters.status,
      role: filters.role,
      sort: filters.sort,
      direction: filters.direction
    });
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Subflows could not be loaded.");
      return;
    }
    const resultPage = result.payload?.page;
    const items = result.payload?.subflows ?? resultPage?.subflows ?? [];
    const total = resultPage?.total ?? items.length;
    const safeOffset = total > 0 && offset >= total ? Math.max(0, Math.floor((total - 1) / page.limit) * page.limit) : offset;
    if (safeOffset !== offset) {
      void loadSubflows(safeOffset);
      return;
    }
    setSubflows(items);
    setPage((current) => ({ limit: resultPage?.limit ?? current.limit, offset: resultPage?.offset ?? offset, total }));

  };

  const beginSubflowAction = (subflow: any, action: "rename" | "duplicate" | "enable" | "disable" | "archive" | "delete") => {
    setSubflowAction({ subflow, action, name: action === "duplicate" ? String(subflow.name ?? "") + " Copy" : String(subflow.name ?? ""), pin: "" });
  };

  const completeSubflowAction = async () => {
    if (!props.projectId || !flowId || !subflowAction?.pin.trim()) return;
    setActionSaving(true);
    setError("");
    const result = await props.commands.applyAction(subflowAction.action, { projectId: props.projectId, flowId, subflowId: subflowAction.subflow.subflowId, authorizationPin: subflowAction.pin.trim(), ...(["rename", "duplicate"].includes(subflowAction.action) ? { name: subflowAction.name.trim() } : {}) });
    setActionSaving(false);
    if (!result.ok) { setError(result.error ?? "Subflow change could not be saved."); return; }
    setSubflowAction(null);
    commitAutomationStudioMutation({
      kind: "subflow.changed",
      projectId: props.projectId,
      flowId,
      subflowId: subflowAction.subflow.subflowId
    });
    await loadSubflows(page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  const lastOffset = page.total ? Math.floor((page.total - 1) / page.limit) * page.limit : 0;
  const firstVisible = page.total ? page.offset + 1 : 0;
  const lastVisible = Math.min(page.total, page.offset + subflows.length);
  const filtered = Boolean(filters.search || filters.status || filters.role);
  const actionReferences = subflowAction ? routerReferencesForSubflow(router, subflowAction.subflow.subflowId) : [];

  return (
    <section className="automation-runs-workspace automation-subflow-directory">
      {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void loadSubflows(page.offset)} type="button">Retry</button></div> : null}
      <header>
        <div><strong>Subflows</strong><span>{props.flow?.name ?? "Select a Flow"}</span></div>
        <span className="automation-subflow-directory-count">{String(page.total)}</span>
      </header>
      <div className="automation-subflow-directory-toolbar" role="search">
        <label className="automation-subflow-search"><Search size={14} aria-hidden /><input aria-label="Search subflows" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search subflows" type="search" value={queryInput} /></label>
        <select aria-label="Filter by status" onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select>
        <select aria-label="Filter by role" onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))} value={filters.role}><option value="">All roles</option>{["primary", "site", "screen", "integration", "recovery", "fallback", "utility"].map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <select aria-label="Sort subflows" onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SubflowDirectoryState["sort"] }))} value={filters.sort}><option value="updated">Recently updated</option><option value="name">Name</option><option value="status">Status</option><option value="role">Role</option></select>
        <button aria-label={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} className="icon-button" onClick={() => setFilters((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))} title={filters.direction === "asc" ? "Sort descending" : "Sort ascending"} type="button">{filters.direction === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}</button>
      </div>
      <div aria-busy={loading} className="automation-subflow-directory-list" role="list" aria-label="Flow subflows">
        {subflows.map((subflow) => {
          const references = routerReferencesForSubflow(router, subflow.subflowId);
          const readiness = subflowReadiness(subflow);
          return (
          <div className="automation-subflow-directory-row" key={subflow.subflowId} role="listitem">
            <button aria-label={"Open " + (subflow.name ?? subflow.subflowId) + " in Flow editor"} className="automation-subflow-directory-open" onClick={() => props.onOpenSubflow?.(flowId, subflow.subflowId, "preview")} type="button">
              <span className="automation-subflow-directory-icon"><Workflow size={17} aria-hidden /></span>
              <span className="automation-subflow-directory-main"><strong>{subflow.name ?? subflow.subflowId}</strong><small>{subflow.subflowId}</small></span>
              <span className="automation-subflow-directory-meta"><span>{subflow.role ?? "utility"}</span><StatusBadge value={subflow.status ?? "active"} /><span className={"automation-subflow-readiness " + readiness.tone}>{readiness.label}</span><span>{references.length ? references.length + (references.length === 1 ? " Router reference" : " Router references") : routerLoaded ? "Not routed" : "Checking routes"}</span><span>{formatRuntimeTimestamp(subflow.updatedAt)}</span></span>
              <ChevronRight size={16} aria-hidden />
            </button>
            <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + String(subflow.name ?? subflow.subflowId)} options={[
              { id: "rename", label: "Rename subflow", icon: <Pencil size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, "rename") },
              { id: "duplicate", label: "Duplicate subflow", icon: <Copy size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, "duplicate") },
              { id: "lifecycle", label: subflow.status === "active" ? "Disable subflow" : "Enable subflow", icon: <Power size={14} aria-hidden />, onSelect: () => beginSubflowAction(subflow, subflow.status === "active" ? "disable" : "enable") },
              { id: "archive", label: "Archive subflow", icon: <Workflow size={14} aria-hidden />, disabled: subflow.status === "archived", onSelect: () => beginSubflowAction(subflow, "archive") },
              { id: "delete", label: "Delete subflow", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => beginSubflowAction(subflow, "delete") }
            ]} />
          </div>
          );
        })}
        {loading && !subflows.length ? <div className="automation-router-loading" aria-label="Loading subflows"><span /><span /><span /></div> : null}
        {!loading && !subflows.length ? <div className="automation-subflow-directory-empty"><Workflow size={22} aria-hidden /><strong>{flowId ? filtered ? "No matching subflows" : "No subflows yet" : "Select a Flow"}</strong><span>{flowId ? filtered ? "Adjust the search or filters to see other subflows." : "Add subflows from the plus button beside the Subflows folder." : "Choose a Flow to view its subflows."}</span></div> : null}
      </div>
      <footer className="automation-subflow-directory-footer">
        <span>{firstVisible}-{lastVisible} of {page.total}</span>
        <label>Rows <select aria-label="Subflows per page" onChange={(event) => setPage((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))} value={page.limit}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
        <div>
          <button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadSubflows(0)} title="First page" aria-label="First page" type="button"><ChevronsLeft size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || page.offset <= 0} onClick={() => void loadSubflows(previousOffset)} title="Previous page" aria-label="Previous page" type="button"><ChevronLeft size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadSubflows(nextOffset)} title="Next page" aria-label="Next page" type="button"><ChevronRight size={14} aria-hidden /></button>
          <button className="icon-button" disabled={loading || nextOffset >= page.total} onClick={() => void loadSubflows(lastOffset)} title="Last page" aria-label="Last page" type="button"><ChevronsRight size={14} aria-hidden /></button>
        </div>
      </footer>
      {subflowAction ? <Modal title={subflowAction.action === "rename" ? "Rename Subflow" : subflowAction.action === "duplicate" ? "Duplicate Subflow" : subflowAction.action === "delete" ? "Delete Subflow" : subflowAction.action === "archive" ? "Archive Subflow" : subflowAction.action === "disable" ? "Disable Subflow" : "Enable Subflow"} onClose={() => setSubflowAction(null)}>
        <div className="automation-modal-form">
          <p className="automation-router-modal-intro">{subflowAction.action === "delete" ? "This removes the Subflow and its Nodes graph. Router references must be removed first." : subflowAction.action === "duplicate" ? "The duplicate receives an independent Nodes graph." : "Update this Subflow without changing its stable identity."}</p>
          {subflowAction.action === "delete" && actionReferences.length ? <div className="automation-subflow-reference-warning" role="alert"><strong>Still used by Router</strong><span>Remove these references before deleting:</span><ul>{actionReferences.map((reference) => <li key={reference.id}>{reference.name} - {reference.condition}</li>)}</ul></div> : null}
          {subflowAction.action === "rename" || subflowAction.action === "duplicate" ? <Field label="Name"><input autoFocus value={subflowAction.name} onChange={(event) => setSubflowAction((current) => current ? { ...current, name: event.target.value } : current)} /></Field> : null}
          <Field label="Security PIN"><input autoFocus={!["rename", "duplicate"].includes(subflowAction.action)} inputMode="numeric" value={subflowAction.pin} onChange={(event) => setSubflowAction((current) => current ? { ...current, pin: event.target.value.replace(/\D/g, "") } : current)} /></Field>
          <div className="modal-actions"><button className="button" onClick={() => setSubflowAction(null)} type="button">Cancel</button><button className={"button " + (subflowAction.action === "delete" ? "danger" : "button-primary")} disabled={actionSaving || !subflowAction.pin.trim() || (["rename", "duplicate"].includes(subflowAction.action) && !subflowAction.name.trim()) || (subflowAction.action === "delete" && actionReferences.length > 0)} onClick={() => void completeSubflowAction()} type="button">{actionSaving ? "Saving..." : subflowAction.action === "delete" ? "Delete Subflow" : "Confirm"}</button></div>
        </div>
      </Modal> : null}
    </section>
  );
}

export * from "./subflow-directory-model";
