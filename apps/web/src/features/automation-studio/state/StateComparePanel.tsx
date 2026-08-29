import type { NodeStateViewModel } from "./model/types";

export function StateComparePanel(props: { model: NodeStateViewModel; onSelectEvidence(id: string): void; onSelectFact(path: string): void }) {
  const comparison = props.model.runtimeComparison;
  if (!comparison) return <div className="automation-state-compare-list"><div><strong>No runtime comparison</strong><span>Select runtime actual output to compare expected facts with the current state.</span></div></div>;
  return (
    <div className="automation-state-compare-list">
      <header>
        <strong>Expected vs Actual</strong>
        <span>{comparison.matches.length} matched | {comparison.mismatches.length} failed | {comparison.irrelevant.length} irrelevant</span>
      </header>
      {comparison.rows.map((row) => (
        <button className={`status-${row.status}`} key={row.id} onClick={() => row.evidenceId ? props.onSelectEvidence(row.evidenceId) : props.onSelectFact(row.factPath)} type="button">
          <strong>{row.label}</strong>
          <span>{row.status === "mismatch" ? "Mismatch" : row.status === "match" ? "Match" : "Irrelevant"}</span>
          <code>{row.expected} {"->"} {row.actual}</code>
          {row.severity || row.score !== undefined ? <small>{row.severity ?? `score ${row.score?.toFixed(2)}`}</small> : null}
        </button>
      ))}
      {!comparison.rows.length ? <div><strong>No comparable facts</strong><span>The runtime source has no expected or actual facts to compare.</span></div> : null}
    </div>
  );
}
