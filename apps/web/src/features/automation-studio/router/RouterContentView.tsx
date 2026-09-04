import type { Dispatch, SetStateAction } from "react";
import { Combobox, Field, Menu, Modal, StatusBadge, StatusText } from "../../programs/shared-ui";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CircleCheck, Copy, MoreHorizontal, Pencil, Plus, Power, Route, Search, Trash2, Workflow, X } from "lucide-react";
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
  routeCounts: { total: number; active: number; disabled: number; byGroup: Record<string, number> };
  routeHasMore: boolean; routeQuery: string; routeStatus: "all" | "active" | "disabled";
  onNextRoutePage(): void; onPreviousRoutePage(): void; onRouteQuery(value: string): void;
  onRouteStatus(value: "all" | "active" | "disabled"): void; onSubflowQuery(value: string): void;
  subflowTotal: number; subflowsLoading: boolean;
  routeTestResult: null | { matched: boolean; reason: string }; routeTestValue: string;
  runRouteTest(): Promise<void>; saving: boolean; selectedGroupId: string;
  setAuthorization: Setter<Authorization>; setAuthorizationPin: Setter<string>;
  setFallbackDraft: DraftSetter<FallbackDraft>; setFallbackModalOpen: Setter<boolean>; setGroupDraft: DraftSetter<GroupDraft>;
  setGroupModalOpen: Setter<boolean>; setRouteDraft: DraftSetter<RouteDraft>; setRouteModalOpen: Setter<boolean>;
  setRouteTestResult: Setter<null | { matched: boolean; reason: string }>;
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
    setRouteDraft, setRouteModalOpen, setRouteTestResult, setRouteTestValue,
    setSelectedGroupId, sortedRoutes, subflowOptions, testingRoute, visibleRoutePage, visibleRoutes,
    routeCounts, routeHasMore, routeQuery, routeStatus, onNextRoutePage, onPreviousRoutePage,
    onRouteQuery, onRouteStatus, onSubflowQuery, subflowTotal, subflowsLoading
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

  if (!subflowTotal) {
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
            {[{ groupId: "all", name: "All routes", count: routeCounts.total }, { groupId: "ungrouped", name: "Ungrouped", count: routeCounts.byGroup.ungrouped ?? 0 }, ...routeGroups.map((group) => ({ ...group, count: routeCounts.byGroup[group.groupId] ?? 0 }))].map((group) => (
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

        <div className="automation-router-list-controls">
          <label className="automation-router-search">
            <Search aria-hidden size={15} />
            <span className="sr-only">Search routes</span>
            <input onChange={(event) => onRouteQuery(event.target.value)} placeholder="Search routes or targets" type="search" value={routeQuery} />
            {routeQuery ? <button aria-label="Clear route search" onClick={() => onRouteQuery("")} type="button"><X aria-hidden size={14} /></button> : null}
          </label>
          <label className="automation-router-status-filter"><span>Status</span><select aria-label="Filter routes by status" onChange={(event) => onRouteStatus(event.target.value as "all" | "active" | "disabled")} value={routeStatus}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
          <span className="automation-router-filter-summary">{routeCounts.total} route{routeCounts.total === 1 ? "" : "s"}</span>
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
                  { id: "move-down", label: "Move down", icon: <ArrowDown size={14} aria-hidden />, disabled: !routeHasMore && index === visibleRoutes.length - 1, onSelect: () => requestRouteMutation(rule.ruleId, "move_down") },
                  { id: "duplicate", label: "Duplicate route", icon: <Copy size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "duplicate") },
                  { id: "toggle", label: rule.status === "active" ? "Disable route" : "Enable route", icon: <Power size={14} aria-hidden />, onSelect: () => requestRouteMutation(rule.ruleId, "toggle") },
                  { id: "delete", label: "Delete route", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => requestRouteMutation(rule.ruleId, "delete") }
                ]} />
              </div>
            );
          })}
          {!visibleRoutes.length ? <div className="automation-router-routes-empty">
            <Route size={20} aria-hidden />
            <strong>{routeCounts.total ? "No routes on this page" : "No routes yet"}</strong>
            <span>{routeCounts.total ? "Adjust the filters or return to the previous page." : "Add the first route to send runtime traffic to a subflow."}</span>
            <button className="button button-primary" onClick={beginNewRoute} type="button"><Plus size={14} aria-hidden />New Route</button>
          </div> : null}
        </div>
        {routePageOffset > 0 || routeHasMore ? <footer className="automation-runtime-pagination-footer">
          <span>{routeCounts.total ? routePageOffset + 1 : 0}-{Math.min(routeCounts.total, routePageOffset + visibleRoutePage.length)} of {routeCounts.total} routes</span>
          <div className="automation-runtime-pagination">
            <button disabled={routePageOffset === 0} onClick={onPreviousRoutePage} type="button"><ChevronLeft size={15} aria-hidden />Previous</button>
            <button disabled={!routeHasMore} onClick={onNextRoutePage} type="button">Next<ChevronRight size={15} aria-hidden /></button>
          </div>
        </footer> : null}

        <button aria-label="Edit fallback behavior" className="automation-router-fallback-row" onClick={beginFallbackEdit} type="button">
          <span className="automation-router-fallback-icon"><Route size={16} aria-hidden /></span>
          <span><small className="automation-router-fallback-kicker">Final destination</small><strong>Fallback behavior</strong><small>Runs arrive here when no active route matches.</small></span>
          <span className="automation-router-fallback-target"><small>{flowMap?.fallback?.kind === "subflow" ? "Send to subflow" : "Stop the run"}</small><strong>{flowMap?.fallback?.kind === "subflow" ? targetSubflowLabel(activeSubflows, flowMap.fallback.subflowId) : flowMapFallbackLabel(flowMap) === "-" ? "Not configured" : flowMapFallbackLabel(flowMap)}</strong></span>
          <ChevronRight className="automation-router-route-chevron" size={16} aria-hidden />
        </button>
      </section>
      {routeModalOpen && !authorization ? <Modal className="automation-router-modal" title={routeDraft.ruleId ? "Edit route" : "Create a route"} description="Routes are checked from lowest priority number to highest. The first matching route chooses the destination subflow." onClose={() => setRouteModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <section className="automation-router-editor-section automation-router-destination-section" aria-labelledby="route-destination-heading">
            <div className="automation-router-editor-section-heading"><span>1</span><div><strong id="route-destination-heading">Choose a destination</strong><small>Name the route and select where matching runs should go.</small></div></div>
            <div className="automation-router-editor-grid">
              <Field label="Route name"><input autoFocus value={routeDraft.name} onChange={(event) => setRouteDraft((current) => ({ ...current, name: event.target.value }))} placeholder="For example, Handle refund requests" /></Field>
              <Combobox {...(!routeDraft.targetSubflowId ? { error: "Choose a target subflow." } : {})} label="Destination subflow" loading={subflowsLoading} onQueryChange={onSubflowQuery} onChange={(value) => setRouteDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={routeDraft.targetSubflowId} />
            </div>
            <div className="automation-router-editor-grid automation-router-editor-grid-secondary">
              <Field label="Route group"><select value={routeDraft.groupId} onChange={(event) => setRouteDraft((current) => ({ ...current, groupId: event.target.value }))}><option value="">Ungrouped</option>{routeGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></Field>
              <Field label="Priority" hint="Lower numbers are checked first."><input min="0" step="1" type="number" value={routeDraft.order} onChange={(event) => setRouteDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></Field>
            </div>
          </section>
          <section className="automation-router-condition-builder" aria-labelledby="route-match-heading">
            <header>
              <div className="automation-router-editor-section-heading"><span>2</span><div><strong id="route-match-heading">Define when it matches</strong><small>{routeDraft.conditionMode === "always" ? "Use this route whenever it reaches this priority." : flowMapConditionSummary(routeDraft)}</small></div></div>
              <div className="automation-segmented-control" role="group" aria-label="Route match behavior">
                <button aria-pressed={routeDraft.conditionMode === "always"} onClick={() => { setRouteDraft((current) => ({ ...current, conditionMode: "always" })); setRouteTestResult(null); }} type="button">Always</button>
                <button aria-pressed={routeDraft.conditionMode === "when"} onClick={() => { setRouteDraft((current) => ({ ...current, conditionMode: "when" })); setRouteTestResult(null); }} type="button">Only when…</button>
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
          {routeDraft.conditionMode === "when" ? <section className="automation-router-route-test" aria-labelledby="route-test-heading">
            <div className="automation-router-editor-section-heading"><span>3</span><div><strong id="route-test-heading">Try a sample value</strong><small>Confirm the condition behaves as expected before saving.</small></div></div>
            <Field label={"Sample " + (routeDraft.conditionSource === "state" ? "state" : "input") + " value"}>{routeDraft.conditionValueType === "boolean" ? <select value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }}><option value="">Choose value</option><option value="true">True</option><option value="false">False</option></select> : <input type={routeDraft.conditionValueType === "number" ? "number" : "text"} value={routeTestValue} onChange={(event) => { setRouteTestValue(event.target.value); setRouteTestResult(null); }} placeholder="Value received at runtime" />}</Field>
            <button className="button" disabled={testingRoute || (routeDraft.conditionMode === "when" && routeTestValue === "")} onClick={() => void runRouteTest()} type="button">{testingRoute ? "Testing..." : "Test condition"}</button>
            {routeTestResult ? <div className={"automation-router-test-result " + (routeTestResult.matched ? "matched" : "not-matched")} role="status"><CircleCheck size={15} aria-hidden /><span><strong>{routeTestResult.matched ? "Route matches" : "Route does not match"}</strong><small>{routeTestResult.reason}</small></span></div> : null}
          </section> : null}
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
      {fallbackModalOpen && !authorization ? <Modal className="automation-router-modal automation-router-fallback-modal" title="Fallback behavior" description="Choose the safe outcome for runs that reach the end of the route list without a match." onClose={() => setFallbackModalOpen(false)}>
        <div className="automation-modal-form automation-router-route-editor">
          <div className="automation-router-fallback-choices" role="radiogroup" aria-label="Fallback behavior">
            <button aria-checked={fallbackDraft.kind === "subflow"} onClick={() => setFallbackDraft((current) => ({ ...current, kind: "subflow" }))} role="radio" type="button">
              <span className="automation-router-fallback-choice-icon"><Workflow size={18} aria-hidden /></span>
              <span><strong>Continue to a subflow</strong><small>Use a known destination to keep the run moving.</small></span>
              <span className="automation-router-choice-indicator" aria-hidden />
            </button>
            <button aria-checked={fallbackDraft.kind === "fail"} onClick={() => setFallbackDraft((current) => ({ ...current, kind: "fail" }))} role="radio" type="button">
              <span className="automation-router-fallback-choice-icon danger"><AlertTriangle size={18} aria-hidden /></span>
              <span><strong>Stop the run</strong><small>End safely and return a clear explanation.</small></span>
              <span className="automation-router-choice-indicator" aria-hidden />
            </button>
          </div>
          <section className="automation-router-fallback-config">
            {fallbackDraft.kind === "subflow"
              ? <><div className="automation-router-fallback-config-copy"><strong>Destination</strong><small>This subflow runs only when every active route was skipped.</small></div><Combobox {...(!fallbackDraft.targetSubflowId ? { error: "Choose a fallback subflow." } : {})} label="Fallback subflow" loading={subflowsLoading} onQueryChange={onSubflowQuery} onChange={(value) => setFallbackDraft((current) => ({ ...current, targetSubflowId: value }))} options={subflowOptions} placeholder="Search subflows" value={fallbackDraft.targetSubflowId} /></>
              : <><div className="automation-router-fallback-config-copy"><strong>Failure response</strong><small>Write a message that explains why routing could not continue.</small></div><Field label="Run message"><textarea autoFocus rows={3} value={fallbackDraft.message} onChange={(event) => setFallbackDraft((current) => ({ ...current, message: event.target.value }))} placeholder="No route matched this run." /></Field></>}
          </section>
          <div className="modal-actions"><button className="button" onClick={() => setFallbackModalOpen(false)} type="button">Cancel</button><button className="button button-primary" onClick={() => requestAuthorization("save-fallback")} disabled={saving || (fallbackDraft.kind === "subflow" ? !fallbackDraft.targetSubflowId : !fallbackDraft.message.trim())} type="button">Save Fallback</button></div>
        </div>
      </Modal> : null}
      {groupModalOpen && !authorization ? <Modal title={groupDraft.groupId ? "Edit Route Group" : "New Route Group"} onClose={() => setGroupModalOpen(false)}>
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
          <StatusText value={error} />
          <Field label="Security PIN"><input autoFocus inputMode="numeric" maxLength={12} type="password" value={authorizationPin} onChange={(event) => setAuthorizationPin(event.target.value.replace(/\D/g, ""))} /></Field>
          <div className="modal-actions"><button className="button" onClick={() => setAuthorization(null)} type="button">Back</button><button className="button button-primary" data-modal-submit disabled={authorizationPin.length < 4 || saving} onClick={() => void completeAuthorizedAction()} type="button">{saving ? "Saving..." : "Authorize and save"}</button></div>
        </div>
      </Modal> : null}
    </section>
  );
}
