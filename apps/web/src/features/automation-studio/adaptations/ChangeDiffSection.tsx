"use client";

import { useEffect, useState } from "react";
import { DataTable, StatusBadge } from "../../programs/shared-ui";
import { adaptationReviewActions, adaptationReviewCopy, type AdaptationReviewAction } from "./adaptation-model";
import type { AdaptationCommands } from "./adaptation-host";
import { flowChangeDiffMode, flowChangeDiffRows, type ChangeDiffMeasures, type ChangeDiffRow, type ChangeDiffStep, type ChangeDiffTopology } from "./change-diff";

type TopologyState =
  | { state: "loading" }
  | { state: "ready"; topology: ChangeDiffTopology }
  | { state: "failed"; error: string }
  | { state: "unavailable" };

const plural = (value: number, one: string, many: string) => value + " " + (value === 1 ? one : many);

function describe(row: ChangeDiffRow, side: ChangeDiffMeasures | undefined): string {
  if (!side) return "-";
  if (row.targetKind === "router") return side.ruleCount === undefined ? "Rule count not recorded" : plural(side.ruleCount, "rule", "rules");
  const parts = [
    side.nodeCount === undefined ? undefined : plural(side.nodeCount, "step", "steps"),
    side.edgeCount === undefined ? undefined : plural(side.edgeCount, "connection", "connections")
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Step count not read";
}

function beforeCell(row: ChangeDiffRow, topology: TopologyState): string {
  if (row.status === "added") return "Not there yet";
  if (row.status === "unknown") return topology.state === "loading" ? "Reading..." : "Could not be read";
  return describe(row, row.before);
}

const stepName = (step: ChangeDiffStep) => (step.label ?? step.nodeId) + (step.type ? " (" + step.type + ")" : "");

/**
 * The before/after view of a Flow Bootstrap adaptation, with its review
 * actions beside it. Reads the Flow's current Router and Subflows through
 * `loadTopology`; without that command, or when the read fails, it shows the
 * proposed side alone and says so.
 */
export function ChangeDiffSection(props: {
  adaptation: any;
  projectId: string | null;
  flowId: string | undefined;
  loadTopology?: AdaptationCommands["loadTopology"];
  onRequestReview(action: AdaptationReviewAction): void;
}) {
  const { adaptation, projectId, flowId, loadTopology } = props;
  const [topology, setTopology] = useState<TopologyState>(loadTopology ? { state: "loading" } : { state: "unavailable" });
  const [attempt, setAttempt] = useState(0);
  const subflowKey = (Array.isArray(adaptation?.patch) ? adaptation.patch : []).filter((entry: any) => entry?.kind === "create_subflow" || entry?.kind === "edit_subflow").map((entry: any) => entry?.after?.subflowId ?? entry?.targetId).filter((id: unknown) => typeof id === "string").join("|");
  useEffect(() => {
    if (!loadTopology || !projectId || !flowId) { setTopology({ state: "unavailable" }); return; }
    let current = true;
    // A read that settles after this effect is replaced belongs to an older adaptation or attempt.
    const apply = (next: TopologyState) => { if (current) setTopology(next); };
    setTopology({ state: "loading" });
    void loadTopology({ projectId, flowId, subflowIds: subflowKey ? subflowKey.split("|") : [] }).then(
      (result) => apply(result.ok && result.payload?.topology ? { state: "ready", topology: result.payload.topology } : { state: "failed", error: result.error ?? "The current automation could not be read." }),
      (error: unknown) => apply({ state: "failed", error: error instanceof Error ? error.message : String(error) })
    );
    return () => { current = false; };
  }, [loadTopology, projectId, flowId, adaptation?.adaptationId, adaptation?.updatedAt, subflowKey, attempt]);

  const currentTopology = topology.state === "ready" ? topology.topology : null;
  const mode = flowChangeDiffMode(adaptation, currentTopology);
  const rows = flowChangeDiffRows(adaptation, currentTopology);
  const stepRows = rows.filter((row) => row.steps && (row.steps.added.length || row.steps.removed.length));
  const actions = adaptationReviewActions(adaptation?.status ?? "proposed", adaptation?.metadata?.adaptationKind);
  const applied = adaptation?.status === "applied";

  return (
    <section aria-label="Before and after" className="automation-runtime-log-section automation-adaptation-change-diff">
      <header>
        <strong>{mode === "extend" ? "Changes to your existing automation" : "What changes"}</strong>
        <span>{mode === "extend" ? "What this improvement adds to or changes in the automation you already have" : mode === "create" ? "Everything this builds is new" : "What this proposal would build"}</span>
      </header>
      {applied ? <p className="automation-adaptation-copy">These changes are already applied, so the current automation shown as "Before" includes them.</p> : null}
      {topology.state === "failed" ? <div className="automation-runtime-message" role="status">
        <span>The current automation could not be read, so only the proposed version is shown. {topology.error}</span>
        <button className="button" onClick={() => setAttempt((value) => value + 1)} type="button">Retry</button>
      </div> : null}
      {topology.state === "unavailable" ? <p className="automation-adaptation-copy">The current automation is not available here, so only the proposed version is shown.</p> : null}
      <DataTable
        label="Before and after"
        columns={["Part", "Before", "After", "Change"]}
        rowKeys={rows.map((row) => row.targetKind + ":" + row.targetId)}
        rows={rows.map((row) => [
          row.targetKind === "router" ? "Router rules" : "Subflow " + row.label,
          beforeCell(row, topology),
          describe(row, row.after),
          <StatusBadge key={row.targetId} value={row.status} />
        ])}
        empty="This adaptation does not name a Router or Subflow."
      />
      {stepRows.map((row) => <section className="automation-adaptation-step-diff" key={row.targetId} aria-label={"Steps in " + row.label}>
        <header><strong>Steps in {row.label}</strong><span>{plural(row.steps!.kept.length, "step stays", "steps stay")}</span></header>
        {row.steps!.added.length ? <div><span>Added</span><ul aria-label={"Added steps in " + row.label}>{row.steps!.added.map((step) => <li key={step.nodeId}>{stepName(step)}</li>)}</ul></div> : null}
        {row.steps!.removed.length ? <div><span>Removed</span><ul aria-label={"Removed steps in " + row.label}>{row.steps!.removed.map((step) => <li key={step.nodeId}>{stepName(step)}</li>)}</ul></div> : null}
      </section>)}
      <div className="automation-runtime-json-actions" aria-label="Review this change">
        {actions.map((action) => <button className={adaptationReviewCopy(action).danger ? "button button-danger" : action === "apply" ? "button button-primary" : "button"} key={action} onClick={() => props.onRequestReview(action)} type="button">{adaptationReviewCopy(action).label}</button>)}
        {!actions.length ? <span className="automation-adaptation-copy">No review actions are left for this adaptation.</span> : null}
      </div>
    </section>
  );
}
