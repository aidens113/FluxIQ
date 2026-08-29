import type { NodeStateViewModel } from "./model/types";

export type StateEvidenceTarget = { kind: "recording" | "runtime" | "node"; targetId: string; secondaryId?: string };

export function StateEvidenceInspector(props: { model: NodeStateViewModel; selectedEvidenceId: string | undefined;
  selectedFactPath: string | undefined; onSelectEvidence(id: string): void; onSelectFact(path: string): void; onOpenTarget?(target: StateEvidenceTarget): void }) {
  const source = props.model.activeSource;
  const evidence = props.model.evidence.find((item) => item.id === props.selectedEvidenceId) ?? null;
  const fact = props.model.facts.find((item) => item.fullPath === props.selectedFactPath) ?? null;
  const sourceTarget: StateEvidenceTarget | null = source?.kind === "observed"
    ? { kind: "recording", targetId: source.recordingId, ...(source.timelineEntryId ? { secondaryId: source.timelineEntryId } : {}) }
    : source?.kind === "runtime" && source.sessionId ? { kind: "runtime", targetId: source.sessionId } : null;
  const sourceAction = source?.kind === "observed" ? "Open Recording" : source?.kind === "runtime" ? "Open Run Log" : null;
  return (
    <aside className="automation-state-evidence-inspector" aria-label="State evidence inspector">
      <header><strong>Evidence Inspector</strong><span>{evidence?.label ?? fact?.label ?? source?.label ?? "Select state evidence"}</span></header>
      <section>
        <strong>Source</strong>
        <dl><div><dt>Kind</dt><dd>{source?.kind ?? "-"}</dd></div><div><dt>Source</dt><dd>{source?.label ?? "No source selected"}</dd></div>{source?.kind === "learned" && source.confidence !== undefined ? <div><dt>Confidence</dt><dd>{Math.round(source.confidence * 100)}%</dd></div> : null}</dl>
        <div className="automation-state-evidence-links">{sourceTarget && sourceAction ? <StateEvidenceTargetAction label={sourceAction} target={sourceTarget} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} /> : null}{evidence?.nodeId ? <StateEvidenceTargetAction label="Open Node" target={{ kind: "node", targetId: evidence.nodeId }} {...(props.onOpenTarget ? { onOpenTarget: props.onOpenTarget } : {})} /> : null}</div>
      </section>
      {evidence ? <section>
        <strong>Selected Evidence</strong>
        <dl>
          <div><dt>Role</dt><dd>{evidence.role}</dd></div>
          <div><dt>Fact</dt><dd><button onClick={() => props.onSelectFact(evidence.factPath)} type="button">{evidence.factPath}</button></dd></div>
          <div><dt>Comparator</dt><dd>{evidence.comparator}</dd></div>
          <div><dt>Expected</dt><dd>{evidence.expectedValue ?? "-"}</dd></div>
          <div><dt>Confidence</dt><dd>{evidence.confidence === undefined ? "-" : `${Math.round(evidence.confidence * 100)}%`}</dd></div>
          <div><dt>Provenance</dt><dd>{evidence.provenanceCount} source records</dd></div>
        </dl>
      </section> : null}
      {fact ? <section>
        <strong>Selected Fact</strong>
        <dl><div><dt>Path</dt><dd>{fact.fullPath}</dd></div><div><dt>Value</dt><dd>{fact.value}</dd></div><div><dt>Confidence</dt><dd>{fact.confidence === undefined ? "-" : `${Math.round(fact.confidence * 100)}%`}</dd></div><div><dt>Observed</dt><dd>{fact.observedAt === undefined ? "-" : new Date(fact.observedAt).toLocaleString()}</dd></div></dl>
      </section> : null}
      <section className="automation-state-evidence-list">
        <strong>Evidence</strong>
        {props.model.evidence.map((item) => <button aria-pressed={item.id === props.selectedEvidenceId} key={item.id} onClick={() => props.onSelectEvidence(item.id)} type="button"><span>{item.label}</span><small>{item.role} | {item.confidence === undefined ? "confidence unknown" : `${Math.round(item.confidence * 100)}%`}</small></button>)}
        {!props.model.evidence.length ? <span className="automation-state-muted">No evidence bindings for this context.</span> : null}
      </section>
    </aside>
  );
}
function StateEvidenceTargetAction(props: { label: string; target: StateEvidenceTarget; onOpenTarget?(target: StateEvidenceTarget): void }) {
  return props.onOpenTarget
    ? <button onClick={() => props.onOpenTarget?.(props.target)} type="button">{props.label}</button>
    : <span>{props.label}</span>;
}