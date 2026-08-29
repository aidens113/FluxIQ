"use client";

import { Combobox, DataTable, Field, Menu, Modal, StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleCheck, Copy, Info, ListChecks, MoreHorizontal, Search, Pencil, Plus, Power, Route, Trash2, Workflow, X } from "lucide-react";
import { JsonToggle, compactConditionLabel, flowMapFallbackLabel, formatRuntimeTimestamp } from "../runtime";
import { adaptationReviewActions, adaptationReviewCopy, type AdaptationObjectTarget, type AdaptationReviewAction } from "./adaptation-model";
import { useAdaptationCommands, type AdaptationCommands } from "./adaptation-host";
import { AdaptationChangeCard, AdaptationTargetAction } from "./AdaptationChangeCard";

const ADAPTATION_PAGE_SIZE = 25;
const ADAPTATION_DETAIL_PAGE_SIZE = 8;
const ADAPTATION_STATUSES = ["proposed", "testing", "validated", "applied", "rejected", "disabled", "reverted", "superseded"];
const WORKBENCH_PAGE_SIZE = 25;

export type AdaptationsViewProps = {
  projectId: string | null;
  flow: any;
  requestedAdaptationId?: string;
  onOpenTarget?(target: AdaptationObjectTarget): void;
  onSelectedAdaptationChange?(adaptationId: string): void;
};
export function AdaptationsView(props: AdaptationsViewProps) {
  const commands = useAdaptationCommands();
  return <AdaptationsViewContent {...props} commands={commands} />;
}

export function AdaptationsViewContent(props: AdaptationsViewProps & { commands: AdaptationCommands }) {
  const flowId = props.flow?.flowId;
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [sort, setSort] = useState<"updated" | "status" | "risk" | "trigger">("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [adaptations, setAdaptations] = useState<any[]>([]);
  const [page, setPage] = useState({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
  const [selectedAdaptation, setSelectedAdaptation] = useState<any | null>(null);
  const [detailView, setDetailView] = useState<"summary" | "changes" | "evidence" | "validation" | "audit">("summary");
  const [detailOffsets, setDetailOffsets] = useState<Record<string, number>>({ summary: 0, changes: 0, evidence: 0, validation: 0, audit: 0 });
  const [pendingReviewAction, setPendingReviewAction] = useState<AdaptationReviewAction | null>(null);
  const [reviewPin, setReviewPin] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [replacementAdaptationId, setReplacementAdaptationId] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const requestedDetailRef = useRef("");
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchDraft.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);
  useEffect(() => {
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setSelectedAdaptation(null);
    if (!props.projectId || !flowId) {
      setAdaptations([]);
      setPage({ limit: ADAPTATION_PAGE_SIZE, offset: 0, total: 0 });
      return;
    }
    void loadAdaptations(0);
  }, [props.projectId, flowId, status, risk, search, sort, direction]);
  const loadAdaptations = async (offset: number) => {
    if (!props.projectId || !flowId) return;
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError("");
    const result = await props.commands.listAdaptations({
      projectId: props.projectId,
      flowId,
      ...(status ? { status } : {}),
      ...(risk ? { risk } : {}),
      ...(search ? { search } : {}),
      sort,
      direction,
      limit: ADAPTATION_PAGE_SIZE,
      offset
    });
    if (requestId !== listRequestRef.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Adaptations could not be loaded.");
      setAdaptations([]);
      return;
    }
    const resultPage = result.payload?.page;
    setAdaptations(result.payload?.adaptations ?? resultPage?.adaptations ?? []);
    setPage({ limit: resultPage?.limit ?? ADAPTATION_PAGE_SIZE, offset: resultPage?.offset ?? offset, total: resultPage?.total ?? result.payload?.adaptations?.length ?? 0 });
  };
  const openAdaptation = async (adaptationId: string) => {
    if (!props.projectId || !flowId) return;
    requestedDetailRef.current = flowId + ":" + adaptationId;
    props.onSelectedAdaptationChange?.(adaptationId);
    const requestId = ++detailRequestRef.current;
    setLoadingDetail(true);
    setError("");
    const result = await props.commands.loadAdaptation({ projectId: props.projectId, flowId, adaptationId });
    if (requestId !== detailRequestRef.current) return;
    setLoadingDetail(false);
    if (!result.ok || !result.payload?.adaptation) {
      setError(result.error ?? "Adaptation detail could not be loaded.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
    setDetailView("summary");
    setDetailOffsets({ summary: 0, changes: 0, evidence: 0, validation: 0, audit: 0 });
  };
  useEffect(() => {
    const adaptationId = props.requestedAdaptationId;
    if (!flowId || !adaptationId) return;
    const requestKey = flowId + ":" + adaptationId;
    if (requestedDetailRef.current === requestKey) return;
    requestedDetailRef.current = requestKey;
    void openAdaptation(adaptationId);
  }, [flowId, props.projectId, props.requestedAdaptationId]);
  const requestAdaptationReview = (action: AdaptationReviewAction) => {
    setPendingReviewAction(action);
    setReviewPin("");
    setReviewReason("");
    setReplacementAdaptationId("");
    setReviewError("");
  };
  const reviewAdaptation = async () => {
    if (!props.projectId || !flowId || !selectedAdaptation || !pendingReviewAction || reviewPin.length < 4) return;
    if ((pendingReviewAction === "reject" || pendingReviewAction === "supersede") && !reviewReason.trim()) {
      setReviewError("Enter a reason for this decision.");
      return;
    }
    if (pendingReviewAction === "supersede" && !replacementAdaptationId.trim()) {
      setReviewError("Enter the replacement adaptation ID.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    const result = await props.commands.reviewAdaptation({
      projectId: props.projectId,
      flowId,
      adaptationId: selectedAdaptation.adaptationId,
      action: pendingReviewAction,
      authorizationPin: reviewPin,
      ...(reviewReason.trim() ? { reason: reviewReason.trim() } : {}),
      ...(pendingReviewAction === "supersede" ? { supersededByAdaptationId: replacementAdaptationId.trim() } : {})
    });
    setReviewBusy(false);
    if (!result.ok || !result.payload?.adaptation) {
      setReviewError(result.error ?? "Adaptation review action failed.");
      return;
    }
    setSelectedAdaptation(result.payload.adaptation);
    setPendingReviewAction(null);
    setReviewPin("");
    setReviewReason("");
    setReplacementAdaptationId("");
    void loadAdaptations(page.offset);
  };
  const nextOffset = page.offset + page.limit;
  const previousOffset = Math.max(0, page.offset - page.limit);
  const phase9 = selectedAdaptation?.metadata?.phase9 && typeof selectedAdaptation.metadata.phase9 === "object" ? selectedAdaptation.metadata.phase9 : {};
  const phase9Artifacts = Array.isArray(phase9.artifacts) ? phase9.artifacts : [];
  const phase9AuditEvents = Array.isArray(phase9.auditEvents) ? phase9.auditEvents : [];
  const evidenceRows = [
    ...phase9Artifacts.filter((artifact: any) => ["prompt", "response", "evidence", "validation", "rollback"].includes(artifact.artifactKind)).map((artifact: any) => [artifact.artifactKind ?? "Artifact", artifact.summary ?? "Stored object", artifact.objectId ?? "-", formatRuntimeTimestamp(artifact.createdAt)]),
    ...(selectedAdaptation?.sourceRunId ? [["Runtime run", <AdaptationTargetAction key={selectedAdaptation.sourceRunId} target={{ view: "runtime", targetId: selectedAdaptation.sourceRunId, label: "Open run " + selectedAdaptation.sourceRunId }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />, selectedAdaptation.sourceRunId, "-"]] : []),
    ...((selectedAdaptation?.sourceRecordingIds ?? []).map((id: string) => ["Recording", <AdaptationTargetAction key={id} target={{ view: "recording", targetId: id, label: "Open recording " + id }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />, id, "-"])),
    ...((selectedAdaptation?.sourceInstructionIds ?? []).map((id: string) => ["Instruction", <AdaptationTargetAction key={id} target={{ view: "instructions", targetId: id, label: "Open instruction " + id }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />, id, "-"]))
  ];
  const detailTotal = detailView === "changes" ? (selectedAdaptation?.patch?.length ?? 0) : detailView === "evidence" ? evidenceRows.length : detailView === "validation" ? (selectedAdaptation?.validationResults?.length ?? 0) : detailView === "audit" ? phase9AuditEvents.length : 0;
  const detailOffset = Math.min(detailOffsets[detailView] ?? 0, Math.max(0, detailTotal - 1));
  const detailNextOffset = detailOffset + ADAPTATION_DETAIL_PAGE_SIZE;
  const setDetailPageOffset = (offset: number) => setDetailOffsets((current) => ({ ...current, [detailView]: Math.max(0, Math.min(offset, Math.max(0, detailTotal - ADAPTATION_DETAIL_PAGE_SIZE))) }));
  const pagedChanges = (selectedAdaptation?.patch ?? []).slice(detailOffset, detailOffset + ADAPTATION_DETAIL_PAGE_SIZE);
  const pagedEvidenceRows = evidenceRows.slice(detailOffset, detailOffset + ADAPTATION_DETAIL_PAGE_SIZE);
  const pagedValidationRows = (selectedAdaptation?.validationResults ?? []).slice(detailOffset, detailOffset + ADAPTATION_DETAIL_PAGE_SIZE);
  const pagedAuditEvents = phase9AuditEvents.slice(detailOffset, detailOffset + ADAPTATION_DETAIL_PAGE_SIZE);
  return (
    <section className="automation-runs-workspace">
      <header><div><strong>Adaptations</strong><span>Review runtime fixes and promotion evidence</span></div></header>
      {error ? <div className="automation-runtime-message" role="alert"><span>{error}</span><button className="button" disabled={loading} onClick={() => loadAdaptations(page.offset)} type="button">Retry</button></div> : null}
      <div className="automation-runtime-debugger automation-adaptation-workspace">
        <section className="automation-runtime-list-page">
          <header>
            <div><strong>Adaptation Inbox</strong><span>{loading ? "Loading..." : ((page.total ? page.offset + 1 : 0) + "-" + Math.min(page.total, page.offset + adaptations.length) + " of " + page.total)}</span></div>
          </header>
          <div className="automation-adaptation-filters" role="search">
            <label className="automation-adaptation-search"><Search size={15} aria-hidden /><input aria-label="Search adaptations" onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search trigger or ID" type="search" value={searchDraft} /></label>
            <label><span>Status</span><select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="">All statuses</option>{ADAPTATION_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
            <label><span>Risk</span><select aria-label="Filter by risk" onChange={(event) => setRisk(event.target.value)} value={risk}><option value="">All risks</option>{["low", "medium", "high", "destructive"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Sort</span><select aria-label="Sort adaptations" onChange={(event) => setSort(event.target.value as typeof sort)} value={sort}><option value="updated">Last updated</option><option value="status">Status</option><option value="risk">Risk</option><option value="trigger">Trigger</option></select></label>
            <button aria-label={"Sort " + (direction === "desc" ? "ascending" : "descending")} className="automation-adaptation-sort-direction" onClick={() => setDirection((current) => current === "desc" ? "asc" : "desc")} title={"Sort " + (direction === "desc" ? "ascending" : "descending")} type="button">{direction === "desc" ? <ArrowDown size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}</button>
          </div>
          <div aria-busy={loading} aria-label="Adaptations" className="automation-adaptation-table" role="table">
            <div className="automation-adaptation-table-head" role="row"><span role="columnheader">Trigger</span><span role="columnheader">Risk</span><span role="columnheader">Updated</span><span role="columnheader">Status</span></div>
            {!loading && adaptations.map((adaptation) => <button aria-pressed={selectedAdaptation?.adaptationId === adaptation.adaptationId} className={selectedAdaptation?.adaptationId === adaptation.adaptationId ? "selected" : ""} key={adaptation.adaptationId} onClick={() => openAdaptation(adaptation.adaptationId)} role="row" type="button"><span role="cell"><strong>{adaptation.trigger || "Untitled adaptation"}</strong><small>{adaptation.adaptationId}</small></span><span role="cell"><StatusBadge value={adaptation.riskLevel ?? "low"} /></span><span role="cell">{formatRuntimeTimestamp(adaptation.updatedAt)}</span><span role="cell"><StatusBadge value={adaptation.status ?? "proposed"} /></span></button>)}
            {loading ? <div className="automation-runtime-empty" role="status">Loading adaptations...</div> : null}
            {!loading && !adaptations.length ? <div className="automation-runtime-empty">{search || status || risk ? "No adaptations match these filters." : flowId ? "No adaptations have been created for this Flow." : "Select a Flow to review adaptations."}</div> : null}
          </div>
          <footer className="automation-runtime-pagination-footer">
            <span>Page {page.total ? Math.floor(page.offset / page.limit) + 1 : 0} of {page.total ? Math.ceil(page.total / page.limit) : 0}</span>
            <div className="automation-runtime-pagination">
              <button aria-label="Previous adaptations page" disabled={loading || page.offset <= 0} onClick={() => loadAdaptations(previousOffset)} type="button"><ChevronLeft size={16} aria-hidden />Previous</button>
              <button aria-label="Next adaptations page" disabled={loading || nextOffset >= page.total} onClick={() => loadAdaptations(nextOffset)} type="button">Next<ChevronRight size={16} aria-hidden /></button>
            </div>
          </footer>
        </section>
        <section className="automation-runtime-log-page">
          <header>
            <div><strong>Adaptation Detail</strong><span>{loadingDetail ? "Loading..." : selectedAdaptation?.adaptationId ?? "No adaptation selected"}</span></div>
            {selectedAdaptation ? <StatusBadge value={selectedAdaptation.status ?? "proposed"} /> : null}
          </header>
          {selectedAdaptation ? <div className="automation-adaptation-detail">
            <nav aria-label="Adaptation detail views" className="automation-adaptation-tabs">{([
              ["summary", "Summary"],
              ["changes", "Changes"],
              ["evidence", "Evidence"],
              ["validation", "Validation"],
              ["audit", "Audit"]
            ] as const).map(([view, label]) => <button aria-pressed={detailView === view} className={detailView === view ? "selected" : ""} key={view} onClick={() => setDetailView(view)} type="button">{label}</button>)}</nav>
            {detailView === "summary" ? <div className="automation-adaptation-detail-body">
              <section className="automation-adaptation-lead">
                <span>Why this adaptation exists</span>
                <strong>{selectedAdaptation.trigger || "No trigger was recorded."}</strong>
                <p>{selectedAdaptation.diagnosis || "The runtime did not record a diagnosis."}</p>
              </section>
              <SummaryStrip items={[
                ["Risk", selectedAdaptation.riskLevel ?? "-"],
                ["Author", selectedAdaptation.author ?? "-"],
                ["Status", selectedAdaptation.status ?? "-"],
                ["Changes", selectedAdaptation.patch?.length ?? 0],
                ["Validations", selectedAdaptation.validationResults?.length ?? 0]
              ]} />
              <section className="automation-runtime-log-section">
                <header><strong>Scope</strong><span>Where this change belongs</span></header>
                <DataTable columns={["Flow", "Subflow", "Created", "Updated"]} rows={[[selectedAdaptation.flowId ?? "-", selectedAdaptation.subflowId ?? "Top-level Flow", formatRuntimeTimestamp(selectedAdaptation.createdAt), formatRuntimeTimestamp(selectedAdaptation.updatedAt)]]} empty="No scope information." />
              </section>
              {selectedAdaptation.metadata?.approvalDecision ? <section className="automation-runtime-log-section">
                <header><strong>Current Decision</strong><span>{selectedAdaptation.metadata.approvalDecision.autoApply === true ? "Automatically allowed" : selectedAdaptation.metadata.approvalDecision.requiresManualApproval ? "Manual review required" : "Recorded"}</span></header>
                <p className="automation-adaptation-copy">{selectedAdaptation.metadata.approvalDecision.reason ?? "No decision explanation was recorded."}</p>
              </section> : null}
            </div> : null}
            {detailView === "changes" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Planned Changes</strong><span>{selectedAdaptation.patch?.length ?? 0} changes</span></header>
                <div className="automation-adaptation-change-list">{pagedChanges.map((patch: any, index: number) => <AdaptationChangeCard change={patch} key={patch.targetId ?? detailOffset + index} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />)}{!selectedAdaptation.patch?.length ? <p className="automation-runtime-empty">This adaptation does not contain changes.</p> : null}</div>
              </section>
              {selectedAdaptation.metadata?.applicationRecord?.mutations?.length ? <section className="automation-runtime-log-section">
                <header><strong>Applied Changes</strong><span>{selectedAdaptation.metadata.applicationRecord.mutations.length} durable mutations</span></header>
                <div className="automation-adaptation-change-list">{selectedAdaptation.metadata.applicationRecord.mutations.map((mutation: any, index: number) => <AdaptationChangeCard applied change={mutation} key={mutation.targetId ?? index} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} />)}</div>
              </section> : null}
            </div> : null}
            {detailView === "evidence" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Source Evidence</strong><span>Records used to create this adaptation</span></header>
                <DataTable columns={["Type", "Summary", "Reference", "Stored"]} rows={pagedEvidenceRows} empty="No source references were recorded." />
              </section>
              <section className="automation-runtime-log-section">
                <header><strong>Observed Context</strong><span>What the runtime compared</span></header>
                <DataTable columns={["Evidence", "Available"]} rows={[
                  ["Observed state", selectedAdaptation.observedState ? "Recorded" : "Not recorded"],
                  ["Expected state", selectedAdaptation.expectedState ? "Recorded" : "Not recorded"],
                  ["Failed action", selectedAdaptation.failedAction ? "Recorded" : "Not recorded"]
                ]} empty="No observed context." />
              </section>
            </div> : null}
            {detailView === "validation" ? <div className="automation-adaptation-detail-body">
              <section className="automation-runtime-log-section">
                <header><strong>Validation Runs</strong><span>{selectedAdaptation.validationResults?.length ?? 0} checks</span></header>
                <DataTable columns={["Run", "Result", "Checked", "Detail"]} rows={pagedValidationRows.map((validation: any) => [
                  validation.runId ?? "-",
                  <StatusBadge key={validation.runId ?? validation.checkedAt} value={validation.status ?? "unknown"} />,
                  formatRuntimeTimestamp(validation.checkedAt),
                  validation.detail ?? "No additional detail."
                ])} empty="This adaptation has not been validated yet." />
              </section>
            </div> : null}
            {detailView === "audit" ? <div className="automation-adaptation-detail-body">
              {selectedAdaptation.metadata?.approvalDecision ? <section className="automation-runtime-log-section">
                <header><strong>Approval Decision</strong><span>{selectedAdaptation.metadata.approvalDecision.decisionId ?? "Runtime decision"}</span></header>
                <DataTable columns={["Mode", "Risk", "Validation", "Manual", "Reason"]} rows={[[selectedAdaptation.metadata.approvalDecision.mode ?? "-", selectedAdaptation.metadata.approvalDecision.risk ?? selectedAdaptation.riskLevel ?? "-", selectedAdaptation.metadata.approvalDecision.validationStatus ?? "-", selectedAdaptation.metadata.approvalDecision.requiresManualApproval ? "Required" : "Not required", selectedAdaptation.metadata.approvalDecision.reason ?? "-"]]} empty="No approval decision." />
              </section> : null}
              <section className="automation-runtime-log-section">
                <header><strong>Lifecycle Events</strong><span>{phase9.auditTotal ?? phase9AuditEvents.length} events</span></header>
                <DataTable columns={["Event", "Status", "Actor", "Reason", "At"]} rows={pagedAuditEvents.map((event: any) => [event.eventType ?? "event", [event.fromStatus, event.toStatus].filter(Boolean).join(" -> ") || "-", event.actorId ?? "system", event.reason ?? "-", formatRuntimeTimestamp(event.createdAt)])} empty="No typed lifecycle events were recorded." />
              </section>
              <section className="automation-runtime-log-section">
                <header><strong>Review Actions</strong><span>PIN required</span></header>
                <div className="automation-runtime-json-actions">{adaptationReviewActions(selectedAdaptation.status).map((action) => <button className={adaptationReviewCopy(action).danger ? "button button-danger" : action === "apply" ? "button button-primary" : "button"} key={action} onClick={() => requestAdaptationReview(action)} type="button">{adaptationReviewCopy(action).label}</button>)}{!adaptationReviewActions(selectedAdaptation.status).length ? <span className="automation-adaptation-copy">This adaptation is in a terminal state. Its audit record remains available.</span> : null}</div>
              </section>
              <JsonToggle label="Show complete adaptation JSON" value={selectedAdaptation} />
            </div> : null}
            {detailView !== "summary" && detailTotal > ADAPTATION_DETAIL_PAGE_SIZE ? <footer className="automation-runtime-pagination-footer automation-adaptation-detail-pagination">
              <span>{detailTotal ? detailOffset + 1 : 0}-{Math.min(detailTotal, detailOffset + ADAPTATION_DETAIL_PAGE_SIZE)} of {detailTotal}</span>
              <div className="automation-runtime-pagination">
                <button aria-label="Previous adaptation detail page" disabled={detailOffset <= 0} onClick={() => setDetailPageOffset(detailOffset - ADAPTATION_DETAIL_PAGE_SIZE)} type="button"><ChevronLeft size={16} aria-hidden />Previous</button>
                <button aria-label="Next adaptation detail page" disabled={detailNextOffset >= detailTotal} onClick={() => setDetailPageOffset(detailNextOffset)} type="button">Next<ChevronRight size={16} aria-hidden /></button>
              </div>
            </footer> : null}
          </div> : <p className="automation-runtime-empty">Select an adaptation to inspect its evidence, changes, validation, and audit history.</p>}
        </section>
      </div>
      {pendingReviewAction ? <Modal busy={reviewBusy} closeOnEscape={!reviewBusy} description={adaptationReviewCopy(pendingReviewAction).description} title={adaptationReviewCopy(pendingReviewAction).title} onClose={() => !reviewBusy && setPendingReviewAction(null)}>
        <div className="dialog-form">
          {(pendingReviewAction === "reject" || pendingReviewAction === "supersede") ? <Field label="Reason" required><textarea data-autofocus maxLength={1000} onChange={(event) => setReviewReason(event.target.value)} rows={3} value={reviewReason} /></Field> : null}
          {pendingReviewAction === "supersede" ? <Field hint="Use the stable ID shown in the replacement adaptation." label="Replacement adaptation ID" required><input onChange={(event) => setReplacementAdaptationId(event.target.value)} value={replacementAdaptationId} /></Field> : null}
          <Field {...(reviewError ? { error: reviewError } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" data-autofocus={pendingReviewAction !== "reject" && pendingReviewAction !== "supersede"} inputMode="numeric" onChange={(event) => setReviewPin(event.target.value.replace(/\D/g, "").slice(0, 12))} value={reviewPin} /></Field>
        </div>
        <div className="modal-actions">
          <button className="button" disabled={reviewBusy} onClick={() => setPendingReviewAction(null)} type="button">Cancel</button>
          <button className={adaptationReviewCopy(pendingReviewAction).danger ? "button button-danger" : "button button-primary"} data-modal-submit disabled={reviewBusy || reviewPin.length < 4 || ((pendingReviewAction === "reject" || pendingReviewAction === "supersede") && !reviewReason.trim()) || (pendingReviewAction === "supersede" && !replacementAdaptationId.trim())} onClick={() => void reviewAdaptation()} type="button">{reviewBusy ? "Working..." : adaptationReviewCopy(pendingReviewAction).label}</button>
        </div>
      </Modal> : null}
    </section>
  );
}

export function AutomationTrainingStatusPanel(props: { status: { mode: string; runsCompleted: number; stabilityScore: number; learnedChangeCount: number; pendingProposalCount: number; uncertainty: any[]; frozenScopeCount: number } }) {
  const status = props.status;
  return (
    <section className="automation-runtime-log-section">
      <header><strong>Training Status</strong><span>{status.mode}</span></header>
      <SummaryStrip items={[
        ["Runs", status.runsCompleted],
        ["Stability", `${Math.round(status.stabilityScore * 100)}%`],
        ["Learned", status.learnedChangeCount],
        ["Pending", status.pendingProposalCount],
        ["Uncertainty", status.uncertainty.length],
        ["Frozen", status.frozenScopeCount]
      ]} />
    </section>
  );
}

export * from "./adaptation-model";
