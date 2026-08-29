import type { NodeStateViewModel } from "./model/types";

export function StateDiffPanel(props: { model: NodeStateViewModel }) {
  return (
    <div className="automation-state-diff-list">
      {props.model.diffRows.map((row) => <div key={row.id}><strong>{row.path}</strong><span>{row.change}</span><code>{row.before} {"->"} {row.after}</code>{row.confidence ? <small>{row.confidence}</small> : null}</div>)}
      {!props.model.diffRows.length ? <div><strong>No diff rows</strong><span>This source has no before/after state deltas yet.</span></div> : null}
    </div>
  );
}
