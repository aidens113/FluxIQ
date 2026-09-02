"use client";

import { useState } from "react";
import { DataTable, StatusBadge } from "../../programs/shared-ui";
import { ChevronRight, X } from "lucide-react";
import {
  runtimeAttemptsForRunDetail,
  runtimeLlmAdaptationEvents,
  runtimeRecoveryRoutingEvents,
  runtimeRunEffects,
  runtimeRunStateEvidence,
  isRuntimeJsonRecord,
  runtimeCostLabel,
  runtimeStoryStatusClass
} from "./run-detail-model";
import { formatRuntimeDuration, formatRuntimeTimestamp, safeJson } from "./run-format";
import { RUNTIME_ACTION_PAGE_SIZE } from "./run-queries";

export type RuntimePanelTarget = { kind: "router" | "subflow" | "adaptation-detail" | "state"; targetId?: string };

function RuntimeTargetAction(props: { label: string; target: RuntimePanelTarget; onOpenTarget?(target: RuntimePanelTarget): void }) {
  return props.onOpenTarget
    ? <button className="automation-runtime-row-action" onClick={() => props.onOpenTarget?.(props.target)} type="button">{props.label}</button>
    : <span>{props.label}</span>;
}
export function RuntimeRecoveryRoutingPanel(props: { flowId?: string; routeDecisions: any[]; recoveryAttempts: any[]; onOpenTarget?(target: RuntimePanelTarget): void }) {
  const events = runtimeRecoveryRoutingEvents(props.routeDecisions, props.recoveryAttempts);
  return (
    <section className="automation-runtime-log-section automation-runtime-decision-panel">
      <header><strong>Recovery and Routing</strong><span>{props.routeDecisions.length} routes | {props.recoveryAttempts.length} recovery attempts</span></header>
      <div className="automation-runtime-decision-links">
        <RuntimeTargetAction label="Open Router" target={{ kind: "router" }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />
      </div>
      <ol className="automation-runtime-decision-timeline">
        {events.map((event, index) => <li key={event.id}>
          <span className="automation-runtime-decision-index">{index + 1}</span>
          <div>
            <div className="automation-runtime-decision-title"><strong>{event.title}</strong><StatusBadge value={event.status} /></div>
            <span>{event.reason}</span>
            <div className="automation-runtime-decision-meta">
              <span>Target: {event.target}</span>
              {event.fallback ? <span>Fallback</span> : null}
              {event.rejected.length ? <span>{event.rejected.length} alternatives rejected</span> : null}
              {event.kind === "route" && event.detail.selectedSubflowId ? <RuntimeTargetAction label="Open Subflow" target={{ kind: "subflow", targetId: event.detail.selectedSubflowId }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} /> : null}
            </div>
          </div>
          <JsonToggle label="Decision JSON" value={event.detail} />
        </li>)}
      </ol>
      {!events.length ? <p className="automation-runtime-empty">No route or recovery decisions were recorded.</p> : null}
    </section>
  );
}
export function RuntimeLlmAdaptationPanel(props: { flowId?: string; runDetail: any; onOpenTarget?(target: RuntimePanelTarget): void }) {
  const events = runtimeLlmAdaptationEvents(props.runDetail);
  return (
    <section className="automation-runtime-log-section automation-runtime-llm-adaptation-panel">
      <header><strong>LLM and Adaptation</strong><span>{events.length} recorded stages</span></header>
      <ol className="automation-runtime-adaptation-sequence">
        {events.map((event, index) => <li key={event.id}>
          <span className="automation-runtime-decision-index">{index + 1}</span>
          <div>
            <span className="automation-runtime-adaptation-stage">{event.stage}</span>
            <div className="automation-runtime-decision-title"><strong>{event.title}</strong><StatusBadge value={event.status} /></div>
            <p>{event.summary}</p>
            <div className="automation-runtime-decision-meta">
              {event.provider ? <span>Provider: {event.provider}</span> : null}
              {event.model ? <span>Model: {event.model}</span> : null}
              {event.usage ? <span>{event.usage}</span> : null}
              {event.adaptationId ? <RuntimeTargetAction label="Open Adaptation" target={{ kind: "adaptation-detail", targetId: event.adaptationId }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} /> : null}
            </div>
          </div>
          <JsonToggle label="Stage JSON" value={event.detail} />
        </li>)}
      </ol>
      {!events.length ? <p className="automation-runtime-empty">No LLM intervention or adaptation was used in this run.</p> : null}
    </section>
  );
}
export function RuntimeRunStateEffectsPanel(props: { runDetail: any; runId: string | null; visibleAttempts: any[]; onOpenTarget?(target: RuntimePanelTarget): void }) {
  const [view, setView] = useState<"effects" | "state">("effects");
  const [effectOffset, setEffectOffset] = useState(0);
  const effects = runtimeRunEffects(props.runDetail, props.visibleAttempts);
  const stateEvidence = runtimeRunStateEvidence(props.runDetail, props.visibleAttempts);
  const visibleEffects = effects.slice(effectOffset, effectOffset + RUNTIME_ACTION_PAGE_SIZE);
  const finalValues = props.runDetail?.finalValues ?? props.runDetail?.trace?.values ?? {};
  return (
    <section className="automation-runtime-log-section automation-runtime-state-effects-panel">
      <header>
        <div><strong>State and Effects</strong><span>{effects.length} effects | {stateEvidence.length} state references</span></div>
        <div className="automation-runs-view-control" aria-label="State and effects view" role="group">
          <button aria-pressed={view === "effects"} className={view === "effects" ? "button button-primary" : "button"} onClick={() => setView("effects")} type="button">Effects</button>
          <button aria-pressed={view === "state"} className={view === "state" ? "button button-primary" : "button"} onClick={() => setView("state")} type="button">State</button>
        </div>
      </header>
      {view === "effects" ? <>
        <DataTable label="Runtime effects" columns={["#", "Action", "Type", "Payload"]} rows={visibleEffects.map((effect: any, index: number) => [effectOffset + index + 1, effect.nodeId ?? effect.attemptId ?? "-", effect.type ?? "-", <JsonToggle key={`${effectOffset + index}:effect`} label="Show payload" value={effect.payload ?? effect} />])} empty="No runtime effects were dispatched." />
        {effects.length > RUNTIME_ACTION_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer"><span>{effectOffset + 1}-{Math.min(effects.length, effectOffset + RUNTIME_ACTION_PAGE_SIZE)} of {effects.length}</span><div className="automation-runtime-pagination"><button disabled={effectOffset <= 0} onClick={() => setEffectOffset(Math.max(0, effectOffset - RUNTIME_ACTION_PAGE_SIZE))} type="button">Previous</button><button disabled={effectOffset + RUNTIME_ACTION_PAGE_SIZE >= effects.length} onClick={() => setEffectOffset(effectOffset + RUNTIME_ACTION_PAGE_SIZE)} type="button">Next</button></div></footer> : null}
      </> : <>
        <div className="automation-runtime-decision-links"><RuntimeTargetAction label="Open State Viewer" target={{ kind: "state", ...(props.runId ? { targetId: props.runId } : {}) }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} /></div>
        <DataTable label="Runtime state references" columns={["Action", "Phase", "Reference", "Detail"]} rows={stateEvidence.map((item) => [item.action, item.phase, item.stateRef, <JsonToggle key={item.id} label="Show reference" value={item.detail} />])} empty="No state references were recorded for the visible actions." />
        <JsonToggle label={`Show final state (${Object.keys(finalValues).length} keys)`} value={finalValues} />
      </>}
    </section>
  );
}
export function RuntimeRunStory(props: { runDetail: any }) {
  const detail = props.runDetail;
  const summary = detail?.summary ?? {};
  const attemptCount = detail?.summary?.actionAttemptCount ?? runtimeAttemptsForRunDetail(detail).length;
  const recoveryAttempts = Array.isArray(detail?.recoveryAttempts) ? detail.recoveryAttempts : [];
  const interventions = Array.isArray(detail?.interventions) ? detail.interventions : [];
  const runtimePatchAttempts = Array.isArray(detail?.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  const adaptiveRetry = isRuntimeJsonRecord(detail?.metadata?.adaptiveRetry) ? detail.metadata.adaptiveRetry : null;
  const steps = [
    {
      label: "Deterministic Run",
      value: `${attemptCount} actions`,
      status: summary.status ?? detail?.trace?.status ?? "queued"
    },
    {
      label: "Recovery",
      value: recoveryAttempts.length ? `${recoveryAttempts.length} attempts` : "none",
      status: recoveryAttempts.some((attempt: any) => attempt.status === "succeeded") ? "succeeded" : recoveryAttempts.length ? "attempted" : "skipped"
    },
    {
      label: "LLM",
      value: interventions.length ? `${interventions.length} events` : "not used",
      status: interventions.length ? "attempted" : "skipped"
    },
    {
      label: "Patch Test",
      value: runtimePatchAttempts.length ? `${runtimePatchAttempts.length} attempts` : "none",
      status: runtimePatchAttempts.some((attempt: any) => attempt?.patchedTraceStatus === "succeeded" || attempt?.status === "succeeded") ? "succeeded" : runtimePatchAttempts.length ? "attempted" : "skipped"
    },
    {
      label: "Adaptation",
      value: detail?.adaptationIds?.length ? `${detail.adaptationIds.length} created` : "none",
      status: detail?.adaptationIds?.length ? "created" : "skipped"
    },
    {
      label: "Retry",
      value: adaptiveRetry ? String(adaptiveRetry.status ?? "attempted") : "none",
      status: adaptiveRetry?.status ?? "skipped"
    }
  ];
  return (
    <ol className="automation-runtime-story-steps" aria-label="Runtime adaptation story">
      {steps.map((step) => (
        <li className={`automation-runtime-story-step ${runtimeStoryStatusClass(step.status)}`} key={step.label}>
          <span>{step.label}</span>
          <strong>{step.value}</strong>
        </li>
      ))}
    </ol>
  );
}

export function RuntimeMetricsPanel(props: { summary: any; metrics: Record<string, any>; recoveryCount: number; interventionCount: number; adaptationCount: number }) {
  return (
    <div className="automation-runtime-metrics-grid">
      <RuntimeMetric label="Status" value={String(props.summary.status ?? "queued")} />
      <RuntimeMetric label="Actions" value={String(props.summary.actionAttemptCount ?? 0)} />
      <RuntimeMetric label="Recovery" value={String(props.metrics.recoveryAttemptCount ?? props.recoveryCount)} />
      <RuntimeMetric label="LLM Calls" value={String(props.metrics.llmCallCount ?? props.interventionCount)} />
      <RuntimeMetric label="Tokens" value={String(props.metrics.tokenCount ?? props.summary.tokenUsage?.totalTokens ?? 0)} />
      <RuntimeMetric label="Cost" value={runtimeCostLabel(props.metrics.estimatedCostUsd ?? props.summary.tokenUsage?.estimatedCostUsd)} />
      <RuntimeMetric label="Adaptations" value={String(props.metrics.adaptationApplyCount ?? props.adaptationCount)} />
      <RuntimeMetric label="Durable" value={props.metrics.durableBehaviorChanged === true ? "yes" : "no"} />
    </div>
  );
}

function RuntimeMetric(props: { label: string; value: string }) {
  return (
    <div className="automation-runtime-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function RuntimeAttemptRow(props: { attempt: any; index: number; selected?: boolean; onSelect?(): void }) {
  const attempt = props.attempt;
  const comparisonStatus = attempt.comparisonStatus ?? attempt.transitionComparison?.status;
  const recoverySelected = attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected;
  return (
    <article
      aria-current={props.selected ? "true" : undefined}
      className={`automation-runtime-attempt-row ${props.selected ? "selected" : ""}`}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (!props.onSelect || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        props.onSelect();
      }}
      role={props.onSelect ? "button" : undefined}
      tabIndex={props.onSelect ? 0 : undefined}
    >
      <span className="automation-runtime-attempt-index">#{props.index + 1}</span>
      <strong title={attempt.nodeId}>{attempt.nodeId ?? "-"}</strong>
      <StatusBadge value={attempt.status ?? "unknown"} />
      <span title={attempt.definitionId ?? ""}>{attempt.definitionId ?? "-"}</span>
      <span>{attempt.route ?? "-"}</span>
      <span>{formatRuntimeTimestamp(attempt.startedAt)} | {formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)}</span>
      <span>{attempt.regionId ?? "-"}</span>
      <span>{comparisonStatus ? <StatusBadge value={comparisonStatus} /> : "-"}</span>
      <span>{recoverySelected ? `${recoverySelected.kind ?? "-"}${recoverySelected.targetNodeId ? ` -> ${recoverySelected.targetNodeId}` : ""}` : "-"}</span>
      <span title={attempt.message ?? ""}>{attempt.message ?? attempt.policyDecision?.reason ?? (attempt.compositeTarget ? `${attempt.compositeTarget.flowId}@${attempt.compositeTarget.version}` : "-")}</span>
      {props.onSelect ? <ChevronRight aria-label="Open action details" size={16} /> : null}
    </article>
  );
}

export function RuntimeActionDetailPanel(props: { attempt: any; index: number; view: "summary" | "data" | "effects" | "state" | "raw"; onClose(): void; onView(view: "summary" | "data" | "effects" | "state" | "raw"): void }) {
  const attempt = props.attempt;
  const stateRefs = attempt.metadata?.stateRefs ?? {};
  const views = [["summary", "Summary"], ["data", "Data"], ["effects", "Effects"], ["state", "State"], ["raw", "Raw JSON"]] as const;
  return (
    <aside className="automation-runtime-action-detail" aria-label={`Action ${props.index + 1} details`}>
      <header>
        <div><strong>Action #{props.index + 1}</strong><span>{attempt.nodeId ?? attempt.definitionId ?? "Action"}</span></div>
        <button aria-label="Close action details" className="automation-icon-button" onClick={props.onClose} title="Close action details" type="button"><X size={16} /></button>
      </header>
      <div className="automation-runtime-action-detail-tabs" aria-label="Action detail view" role="tablist">
        {views.map(([id, label]) => <button aria-selected={props.view === id} className={props.view === id ? "active" : ""} key={id} onClick={() => props.onView(id)} role="tab" type="button">{label}</button>)}
      </div>
      <div className="automation-runtime-action-detail-body">
        {props.view === "summary" ? <DataTable label="Runtime action summary" columns={["Field", "Value"]} rows={[
          ["Status", <StatusBadge key="status" value={attempt.status ?? "unknown"} />],
          ["Node", attempt.nodeId ?? "-"],
          ["Definition", attempt.definitionId ?? "-"],
          ["Route", attempt.route ?? "-"],
          ["Region", attempt.regionId ?? "-"],
          ["Started", formatRuntimeTimestamp(attempt.startedAt)],
          ["Duration", formatRuntimeDuration(attempt.startedAt, attempt.finishedAt)],
          ["Message", attempt.message ?? attempt.policyDecision?.reason ?? "-"]
        ]} empty="No action summary." /> : null}
        {props.view === "data" ? <div className="automation-runtime-action-detail-stack"><section><strong>Inputs</strong><JsonPreview value={attempt.inputs ?? {}} /></section><section><strong>Outputs</strong><JsonPreview value={attempt.outputs ?? {}} /></section></div> : null}
        {props.view === "effects" ? <DataTable label="Runtime action effects" columns={["Type", "Payload"]} rows={(attempt.effects ?? []).map((effect: any, index: number) => [effect.type ?? `Effect ${index + 1}`, <JsonToggle key={index} label="Show payload" value={effect.payload ?? effect} />])} empty="No effects were emitted by this action." /> : null}
        {props.view === "state" ? <div className="automation-runtime-action-detail-stack"><section><strong>Before action</strong><JsonPreview value={stateRefs.beforeAction ?? {}} /></section><section><strong>After action</strong><JsonPreview value={stateRefs.afterAction ?? {}} /></section><section><strong>State diff</strong><JsonPreview value={stateRefs.stateDiff ?? attempt.metadata?.diffSummary ?? {}} /></section></div> : null}
        {props.view === "raw" ? <JsonPreview value={runtimeAttemptDetailsJson(attempt, attempt.metadata?.recoverySelected ?? attempt.recoveryDecision?.selected)} /> : null}
      </div>
    </aside>
  );
}

function runtimeAttemptDetailsJson(attempt: any, recoverySelected: any) {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    route: attempt.route,
    regionId: attempt.regionId,
    timing: { startedAt: attempt.startedAt, finishedAt: attempt.finishedAt },
    message: attempt.message,
    inputs: attempt.inputs ?? {},
    outputs: attempt.outputs ?? {},
    effects: attempt.effects ?? [],
    transitionComparison: attempt.transitionComparison,
    diffSummary: attempt.metadata?.diffSummary,
    recoverySelected,
    logs: attempt.logs ?? [],
    childTrace: attempt.childTrace,
    policyDecision: attempt.policyDecision,
    compositeTarget: attempt.compositeTarget,
    metadata: attempt.metadata ?? {}
  };
}

export function JsonToggle(props: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="automation-runtime-json-toggle">
      <button onClick={() => setOpen((current) => !current)} type="button">{open ? "Hide" : props.label}</button>
      {open ? <JsonPreview value={props.value} /> : null}
    </div>
  );
}

export function JsonPreview(props: { value: unknown }) {
  return <pre className="automation-runtime-json">{safeJson(props.value)}</pre>;
}

