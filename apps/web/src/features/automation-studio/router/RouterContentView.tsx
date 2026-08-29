import type { Dispatch, SetStateAction } from "react";
import { Combobox, Field, Menu, Modal, StatusBadge, StatusText } from "../../programs/shared-ui";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CircleCheck, Copy, Info, ListChecks, MoreHorizontal, Pencil, Plus, Power, Route, Search, Trash2, Workflow, X } from "lucide-react";
import { flowMapFallbackLabel } from "../runtime";
import { FLOW_MAP_CONDITION_OPERATORS, flowMapConditionOperatorLabel, flowMapConditionSummary, flowMapConditionText, targetSubflowLabel } from "./route-condition-model";

export const ROUTER_ROUTE_PAGE_SIZE = 100;
type Setter<T> = Dispatch<SetStateAction<T>>;
type DraftSetter<T> = (update: (current: T) => T) => void;
type RouteDraft = ReturnType<typeof import("./route-condition-model").defaultFlowMapRouteDraftShape>;
type FallbackDraft = { kind: "subflow" | "fail"; targetSubflowId: string; message: string };
type GroupDraft = { groupId: string; name: string; description: string; order: number; collapsed: boolean; status: string };
type RouteMutation = "move_up" | "move_down" | "duplicate" | "toggle" | "delete";
type Authorization = null | { action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route" };

export type RouterContentViewProps = {
  activeSubflows: any[]; authorization: Authorization; authorizationPin: string;
  beginFallbackEdit(): void; beginNewGroup(): void; beginNewRoute(): void;
  completeAuthorizedAction(): Promise<void>; editGroup(group: any): void; editRoute(rule: any): void;
  error: string; fallbackDraft: FallbackDraft; fallbackModalOpen: boolean; flowId: string | undefined;
  flowMap: any; groupDraft: GroupDraft; groupModalOpen: boolean; loading: boolean;
  onCreateSubflow: (() => void) | undefined; requestAuthorization(action: NonNullable<Authorization>["action"]): void;
  requestRouteMutation(ruleId: string, action: RouteMutation): void; retryFlowMap(): Promise<void>;
  routeDraft: RouteDraft; routeGroups: any[]; routeModalOpen: boolean; routePageOffset: number;
  routeTestResult: null | { matched: boolean; reason: string }; routeTestValue: string;
  runRouteTest(): Promise<void>; saving: boolean; selectedGroupId: string;
  setAuthorization: Setter<Authorization>; setAuthorizationPin: Setter<string>;
  setFallbackDraft: DraftSetter<FallbackDraft>; setFallbackModalOpen: Setter<boolean>; setGroupDraft: DraftSetter<GroupDraft>;
  setGroupModalOpen: Setter<boolean>; setRouteDraft: DraftSetter<RouteDraft>; setRouteModalOpen: Setter<boolean>;
  setRoutePageOffset: Setter<number>; setRouteTestResult: Setter<null | { matched: boolean; reason: string }>;
  setRouteTestValue: Setter<string>; setSelectedGroupId: Setter<string>; sortedRoutes: any[];
  subflowOptions: any[]; testingRoute: boolean; visibleRoutePage: any[]; visibleRoutes: any[];
};

export function RouterContentView(props: RouterContentViewProps) {
  const {
    activeSubflows, authorization, authorizationPin, beginFallbackEdit, beginNewGroup, beginNewRoute,
    completeAuthorizedAction, editGroup, editRoute, error, fallbackDraft, fallbackModalOpen, flowId,
    flowMap, groupDraft, groupModalOpen, loading, onCreateSubflow, requestAuthorization,
    requestRouteMutation, retryFlowMap, routeDraft, routeGroups, routeModalOpen, routePageOffset,
    routeTestResult, routeTestValue, runRouteTest, saving, selectedGroupId, setAuthorization,
    setAuthorizationPin, setFallbackDraft, setFallbackModalOpen, setGroupDraft, setGroupModalOpen,
    setRouteDraft, setRouteModalOpen, setRoutePageOffset, setRouteTestResult, setRouteTestValue,
    setSelectedGroupId, sortedRoutes, subflowOptions, testingRoute, visibleRoutePage, visibleRoutes
  } = props;
  if (!flowId) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        <header><div><strong>Router</strong><span>Route traffic into the right subflow</span></div></header>
        <section className="automation-router-empty-state">
          <Route size={22} aria-hidden />
          <strong>Select a Flow to edit its Router</strong>
          <p>Router rules belong to one top-level Flow.</p>
        </section>
      </section>
    );
  }
  if (loading) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        <header>
          <div><strong>Router</strong><span>Loading route targets...</span></div>
        </header>
        <div aria-busy="true" className="automation-router-loading" aria-label="Loading Router routes">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (!activeSubflows.length) {
    return (
      <section className="automation-runs-workspace automation-flow-map-workspace">
        {error ? <div className="automation-router-error" role="alert"><StatusText value={error} /><button className="button" onClick={() => void retryFlowMap()} type="button">Retry</button></div> : null}
        <header><div><strong>Router</strong><span>Route traffic into the right subflow</span></div></header>
        <section className="automation-router-empty-state">
          <Workflow size={22} aria-hidden />
          <strong>This Flow needs a subflow</strong>
          <p>Router rules send each run to a subflow target.</p>
          <button className="button button-primary" disabled={!onCreateSubflow} onClick={onCreateSubflow} type="button">
            <Plus size={14} aria-hidden />Create Subflow
          </button>
        </section>
      </section>
    );
  }
  return (
    <section className="automation-runs-workspace automation-flow-map-workspace">
      <StatusText value={error} />
      <header>
        <div><strong>Router</strong><span>{saving ? "Saving changes..." : flowMap?.name ?? "Flow Map route orchestration"}</span></div>
        <div className="automation-runtime-log-toolbar">
          <button className="button button-primary" onClick={beginNewRoute} disabled={!flowId || !activeSubflows.length} type="button"><Plus size={14} aria-hidden />New Route</button>
        </div>
      </header>
      <section className="automation-router-workbench" aria-label="Router routes">
        <div className="automation-router-group-bar">
          <div className="automation-router-group-filters" role="group" aria-label="Filter routes by group">
            {[{ groupId: "all", name: "All routes", count: sortedRoutes.length }, { groupId: "ungrouped", name: "Ungrouped", count: sortedRoutes.filter((route) => !route.metadata?.groupId).length }, ...routeGroups.map((group) => ({ ...group, count: sortedRoutes.filter((route) => route.metadata?.groupId === group.groupId).length }))].map((group) => (
              <div className={`automation-router-group-option${selectedGroupId === group.groupId ? " selected" : ""}`} key={group.groupId}>
                <button aria-pressed={selectedGroupId === group.groupId} onClick={() => setSelectedGroupId(group.groupId)} type="button">
                  <span>{group.name}</span>
                  <small>{group.count}</small>
                </button>
                {group.groupId !== "all" && group.groupId !== "ungrouped" ? <button aria-label={`Edit ${group.name}`} className="automation-router-group-edit" onClick={() => editGroup(group)} title={`Edit ${group.name}`} type="button"><Pencil size={13} aria-hidden /></button> : null}
              </div>
            ))}
          </div>
          <button className="button automation-router-new-group" onClick={beginNewGroup} disabled={!flowId} type="button"><Plus size={14} aria-hidden />Group</button>
        </div>

        <div className="automation-router-route-list-heading" aria-hidden>
          <span>Order</span>
          <span>Route and condition</span>
          <span>Target</span>
          <span>Group</span>
          <span>Status</span>
          <span />
        </div>
        <div className="automation-router-route-rows">
          {visibleRoutePage.map((rule, index) => {
            const routeIndex = routePageOffset + index;
            const group = routeGroups.find((item) => item.groupId === rule.metadata?.groupId);
            return (
              <div className="automation-router-route-row" key={rule.ruleId}>
                <button aria-label={"Priority " + String(rule.order ?? routeIndex + 1) + ": " + String(rule.name ?? rule.ruleId) + " to " + targetSubflowLabel(activeSubflows, rule.target?.subflowId)} className="automation-router-route-main" onClick={() => editRoute(rule)} type="button">
                  <span className="automation-router-route-order">{rule.order ?? routeIndex + 1}</span>
                  <span className="automation-router-route-copy"><strong>{rule.name ?? rule.ruleId}</strong><small>{flowMapConditionText(rule)}</small></span>
                  <span className="automation-router-route-target"><Workflow size={14} aria-hidden />{targetSubflowLabel(activeSubflows, rule.target?.subflowId)}</span>
                  <span className="automation-router-route-group">{group?.name ?? "Ungrouped"}</span>
                  <span className="automation-router-route-status"><StatusBadge value={rule.status ?? "active"} /></span>
                </button>
                <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + String(rule.name ?? rule.ruleId)} options={[
                  { id: "move-up", label: "Move up", icon: <ArrowUp size={14} aria-hidden />, disabled: routeIndex === 0, onSelect: () => requestRouteMutation(rule.ruleId, "move_up") },
                  { id: "move-down", label: "Move down", icon: <ArrowDown size={14} aria-hidden />, disabled: routeIndex === visibleRoutes.length - 1, onSelect: () => requestRouteMutation(rule.ruleId, "move_down") },
                  { id: "duplicate", label: "Duplicate route", icon: <Copy size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "duplicate") },
                  { id: "toggle", label: rule.status === "active" ? "Disable route" : "Enable route", icon: <Power size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "toggle") },
                  { id: "delete", label: "Delete route", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => requestRouteMutation(rule.ruleId, "delete") }
                ]} />
              </div>
            );
          })}
          {!visibleRoutes.length ? <div className="automation-router-routes-empty">
            <Route size={20} aria-hidden />
            <strong>{sortedRoutes.length ? "No routes in this group" : "No routes yet"}</strong>
            <span>{sortedRoutes.length ? "Choose another group or add a route here." : "Add the first route to send runtime traffic to a subflow."}</span>
            <button className="button button-primary" onClick={beginNewRoute} type="button"><Plus size={14} aria-hidden />New Route</button>
          </div> : null}
        </div>
        {visibleRoutes.length > ROUTER_ROUTE_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer">
          <span>{routePageOffset + 1}-{Math.min(visibleRoutes.length, routePageOffset + visibleRoutePage.length)} of {visibleRoutes.length} routes</span>
          <div className="automation-runtime-pagination">
            <button disabled={routePageOffset === 0} onClick={() => setRoutePageOffset(Math.max(0, routePageOffset - ROUTER_ROUTE_PAGE_SIZE))} type="button"><ChevronLeft size={15} aria-hidden />Previous</button>
            <button disabled={routePageOffset + ROUTER_ROUTE_PAGE_SIZE >= visibleRoutes.length} onClick={() => setRoutePageOffset(routePageOffset + ROUTER_ROUTE_PAGE_SIZE)} type="button">Next<ChevronRight size={15} aria-hidden /></button>
          </div>
        </footer> : null}

        <button aria-label="Edit fallback behavior" className="automation-router-fallback-row" onClick={beginFallbackEdit} type="button">
          <span className="automation-router-fallback-icon"><Route size={16} aria-hidden /></span>
          <span><strong>Fallback</strong><small>Used when no route condition matches</small></span>
          <span className="automation-router-fallback-target">{flowMap?.fallback?.kind === "subflow" ? targetSubflowLabel(activeSubflows, flowMap.fallback.subflowId) : flowMapFallbackLabel(flowMap) === "-" ? "Not configured" : flowMapFallbackLabel(flowMap)}</span>
          <ChevronRight className="automation-router-route-chevron" size={16} aria-hidden />
        </button>
      </section>
      {routeModalOpen ? <Modal className="automation-router-modal" title={routeDraft.ruleId ? "Edit Route" : "New Route"} onClose={() => setRouteModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <div className="automation-router-editor-grid">
            <Field label="Route name"><input autoFocus value={routeDraft.name} onChange={(event) => setRouteDraft((current) => ({ ...current, name: event.target.value }))} placeholder="For example, Handle refund requests" /></Field>
            <Combobox {...(!routeDraft.targetSubflowId ? { error: "Choose a target subflow." } : {})} label="Target subflow" onChange={(value) => setRouteDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={routeDraft.targetSubflowId} />
            <Field label="Route group"><select value={routeDraft.groupId} onChange={(event) => setRouteDraft((current) => ({ ...current, groupId: event.target.value }))}><option value="">Ungrouped</option>{routeGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></Field>
            <Field label="Priority"><input min="0" step="1" type="number" value={routeDraft.order} onChange={(event) => setRouteDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></Field>
          </div>
          <section className="automation-router-condition-builder" aria-labelledby="route-match-heading">
            <header>
              <div><strong id="route-match-heading">Match behavior</strong><span>{routeDraft.conditionMode === "always" ? "This route is considered whenever earlier routes do not match." : flowMapConditionSummary(routeDraft)}</span></div>
              <div className="automation-segmented-control" role="group" aria-label="Route match behavior">
                <button aria-pressed={routeDraft.conditionMode === "always"} onClick={() => setRouteDraft((current) => ({ ...current, conditionMode: "always" }))} type="button">Always</button>
                <button aria-pressed={routeDraft.conditionMode === "when"} onClick={() => setRouteDraft((current) => ({ ...current, conditionMode: "when" }))} type="button">When</button>
              </div>
            </header>
            {routeDraft.conditionMode === "when" ? <div className="automation-router-condition-row">
              <Field label="Source"><select value={routeDraft.conditionSource} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionSource: event.target.value }))}><option value="inputs">Run input</option><option value="state">Current state</option></select></Field>
              <Field label="Field"><input value={routeDraft.conditionField} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionField: event.target.value.replace(/^\.+/, "") }))} placeholder="intent" /></Field>
              <Field label="Comparison"><select value={routeDraft.conditionOperator} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionOperator: event.target.value }))}>{FLOW_MAP_CONDITION_OPERATORS.map((operator) => <option key={operator} value={operator}>{flowMapConditionOperatorLabel(operator)}</option>)}</select></Field>
              {routeDraft.conditionOperator !== "exists" ? <Field label="Value type"><select value={routeDraft.conditionValueType} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionValueType: event.target.value }))}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True or false</option></select></Field> : null}
              {routeDraft.conditionOperator !== "exists" ? <Field label="Expected value">{routeDraft.conditionValueType === "boolean" ? <select value={routeDraft.conditionExpected} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionExpected: event.target.value }))}><option value="true">True</option><option value="false">False</option></select> : <input type={routeDraft.conditionValueType === "number" ? "number" : "text"} value={routeDraft.conditionExpected} onChange={(event) => setRouteDraft((current) => ({ ...current, conditionExpected: event.target.value }))} placeholder={routeDraft.conditionValueType === "number" ? "0" : "Value to compare"} />}</Field> : null}
            </div> : null}
          </section>
          <section className="automation-router-route-test" aria-labelledby="route-test-heading">
            <div><strong id="route-test-heading">Test this route</strong><span>Check this condition with a sample value before saving.</span></div>
            {routeDraft.conditionMode === "when" ? <Field label={"Sample " + (routeDraft.conditionSource === "state" ? "state" : "input") + " value"}>{routeDraft.conditionValueType === "boolean" ? <select value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }}><option value="">Choose value</option><option value="true">True</option><option value="false">False</option></select> : <input type={routeDraft.conditionValueType === "number" ? "number" : "text"} value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }} placeholder="Value received at runtime" />}</Field> : null}
            <button className="button" disabled={testingRoute || (routeDraft.conditionMode === "when" && routeTestValue === "")} onClick={() => void runRouteTest()} type="button">{testingRoute ? "Testing..." : "Test condition"}</button>
            {routeTestResult ? <div className={"automation-router-test-result " + (routeTestResult.matched ? "matched" : "not-matched")} role="status"><CircleCheck size={15} aria-hidden /><span><strong>{routeTestResult.matched ? "Route matches" : "Route does not match"}</strong><small>{routeTestResult.reason}</small></span></div> : null}
          </section>
          <details className="automation-router-route-details">
            <summary>Route details</summary>
            <div className="automation-router-editor-grid">
              <Field label="Status"><select value={routeDraft.status} onChange={(event) => setRouteDraft((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></Field>
              <Field label="Confidence"><input max="1" min="0" step="0.01" type="number" value={routeDraft.confidence} onChange={(event) => setRouteDraft((current) => ({ ...current, confidence: Number(event.target.value) }))} /></Field>
              <Field label="Description"><textarea rows={3} value={routeDraft.description} onChange={(event) => setRouteDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
            </div>
          </details>
          <div className="modal-actions automation-router-editor-actions">
            {routeDraft.ruleId ? <button className="button danger" onClick={() => requestAuthorization("delete-route")} disabled={saving} type="button"><Trash2 size={14} aria-hidden />Delete</button> : <span />}
            <div><button className="button" onClick={() => setRouteModalOpen(false)} type="button">Cancel</button><button className="button button-primary" onClick={() => requestAuthorization("save-route")} disabled={!routeDraft.name.trim() || !routeDraft.targetSubflowId || saving || (routeDraft.conditionMode === "when" && !routeDraft.conditionField.trim())} type="button">Save Route</button></div>
          </div>
        </div>
      </Modal> : null}
      {fallbackModalOpen ? <Modal className="automation-router-modal" title="Fallback Behavior" onClose={() => setFallbackModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <p className="automation-router-modal-intro">Choose what the Router should do when no active route matches.</p>
          <Field label="Behavior">
            <select value={fallbackDraft.kind} onChange={(event) => setFallbackDraft((current) => ({ ...current, kind: event.target.value === "subflow" ? "subflow" : "fail" }))}>
              <option value="subflow">Send to a subflow</option>
              <option value="fail">Stop the run</option>
            </select>
          </Field>
          {fallbackDraft.kind === "subflow"
            ? <Combobox {...(!fallbackDraft.targetSubflowId ? { error: "Choose a fallback subflow." } : {})} label="Fallback subflow" onChange={(value) => setFallbackDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={fallbackDraft.targetSubflowId} />
            : <Field label="Run message"><textarea autoFocus rows={3} value={fallbackDraft.message} onChange={(event) => setFallbackDraft((current) => ({ ...current, message: event.target.value }))} placeholder="Explain why the run stopped" /></Field>}
          <div className="modal-actions"><button className="button" onClick={() => setFallbackModalOpen(false)} type="button">Cancel</button><button className="button button-primary" onClick={() => requestAuthorization("save-fallback")} disabled={saving || (fallbackDraft.kind === "subflow" ? !fallbackDraft.targetSubflowId : !fallbackDraft.message.trim())} type="button">Save Fallback</button></div>
        </div>
      </Modal> : null}
      {groupModalOpen ? <Modal title={groupDraft.groupId ? "Edit Route Group" : "New Route Group"} onClose={() => setGroupModalOpen(false)}>
        <div className="automation-modal-form">
          <Field label="Name"><input autoFocus value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Description"><input value={groupDraft.description} onChange={(event) => setGroupDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
          <Field label="Status"><select value={groupDraft.status} onChange={(event) => setGroupDraft((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></Field>
          <Field label="Order"><input type="number" value={groupDraft.order} onChange={(event) => setGroupDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></Field>
          <label className="automation-settings-toggle"><input checked={groupDraft.collapsed} onChange={(event) => setGroupDraft((current) => ({ ...current, collapsed: event.target.checked }))} type="checkbox" /><span>Collapsed by default</span></label>
          <div className="modal-actions"><button className="button button-primary" onClick={() => requestAuthorization("save-group")} disabled={!groupDraft.name.trim()} type="button">Save Group</button>{groupDraft.groupId ? <button className="button danger" onClick={() => requestAuthorization("delete-group")} type="button">Delete Group</button> : null}</div>
        </div>
      </Modal> : null}
      {authorization ? <Modal title="Authorize Router Change" onClose={() => setAuthorization(null)}>
        <div className="automation-modal-form">
          <p className="automation-router-modal-intro">Confirm this Router change with your security PIN.</p>
          <Field label="Security PIN"><input autoFocus inputMode="numeric" value={authorizationPin} onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, ""))} /></Field>
          <div className="modal-actions"><button className="button" onClick={() => setAuthorization(null)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={!authorizationPin.trim() || saving} onClick={() => void completeAuthorizedAction()} type="button">{saving ? "Saving..." : "Confirm"}</button></div>
        </div>
      </Modal> : null}
    </section>
  );
}
