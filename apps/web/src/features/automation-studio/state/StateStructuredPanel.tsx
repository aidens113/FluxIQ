import { useEffect, useState } from "react";
import type { NodeStateViewModel } from "./model/types";

const stateStructuredPageSize = 100;

export function StateStructuredPanel(props: { rows: NodeStateViewModel["structuredRows"]; onSelectFact(path: string): void }) {
  const [requestedPage, setRequestedPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(props.rows.length / stateStructuredPageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const offset = page * stateStructuredPageSize;
  const rows = props.rows.slice(offset, offset + stateStructuredPageSize);
  useEffect(() => { if (requestedPage !== page) setRequestedPage(page); }, [page, requestedPage]);
  return (
    <div className="automation-state-table-wrap">
      <table className="automation-state-table">
        <thead><tr><th>Namespace</th><th>Path</th><th>Value</th><th>Confidence</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map((row) => { const path = `${row.namespace}.${row.path}`; return <tr key={row.id} onClick={() => props.onSelectFact(path)} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); props.onSelectFact(path); }} tabIndex={0}><td>{row.namespace}</td><td><button className="automation-state-fact-link" onClick={(event) => { event.stopPropagation(); props.onSelectFact(path); }} type="button">{row.label}</button></td><td>{row.value}</td><td>{row.confidence ?? "-"}</td><td>{row.source ?? row.type ?? "-"}</td></tr>; })}
          {!props.rows.length ? <tr><td colSpan={5}>No structured state facts are available.</td></tr> : null}
        </tbody>
      </table>
      {props.rows.length > stateStructuredPageSize ? <footer className="automation-state-table-pagination"><span>{offset + 1}-{Math.min(props.rows.length, offset + stateStructuredPageSize)} of {props.rows.length}</span><div><button disabled={page === 0} onClick={() => setRequestedPage(page - 1)} type="button">Previous</button><span>Page {page + 1} of {pageCount}</span><button disabled={page >= pageCount - 1} onClick={() => setRequestedPage(page + 1)} type="button">Next</button></div></footer> : null}
    </div>
  );
}
