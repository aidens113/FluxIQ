"use client";

import { EmptyState, KeyValue, StatusBadge } from "../../components";
import type { projectRuntimeSnapshot } from ".";

type Row = NonNullable<ReturnType<typeof projectRuntimeSnapshot>>["clients"][number];

export function RuntimeInventory(props: { label: string; rows: Row[]; selected: Row | undefined; onSelect(key: string): void; showDetail: boolean }) {
  return <>
    <table aria-label={props.label} className="background-run-table"><thead><tr><th>Identity</th><th>Kind</th><th>Status</th></tr></thead><tbody>
      {props.rows.map((entry) => <tr key={entry.key}><td><button type="button" aria-pressed={props.selected?.key === entry.key} onClick={() => props.onSelect(entry.key)}>{entry.label}<small> {entry.id}</small></button></td><td>{entry.kind}</td><td><StatusBadge value={entry.status} /></td></tr>)}
    </tbody></table>
    {!props.rows.length ? <EmptyState title="No matching entries" description="Change the section, search or filter; use Refresh to read current runtime state." /> : null}
    {props.showDetail && props.selected ? <section aria-label="Selected runtime entry"><h3>{props.selected.label}</h3><KeyValue rows={props.selected.values} /></section> : null}
  </>;
}
