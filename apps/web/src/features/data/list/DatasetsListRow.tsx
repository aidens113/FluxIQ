"use client";

import Link from "next/link";
import { agoText } from "../../home/model";
import type { DatasetRow } from "../model";

/** One table: its name opens the rows; the run it came from is a link. */
export function DatasetsListRow(props: { row: DatasetRow; now: number; selected: boolean; onOpen(): void }) {
  const { row } = props;
  return (
    <li className="data-row" data-selected={props.selected ? "true" : "false"}>
      <button className="data-open" type="button" aria-pressed={props.selected} onClick={props.onOpen}>{row.name}</button>
      <span className="data-muted">
        {row.flowName} · {row.rowCount}{row.truncated ? "+" : ""} rows · collected {agoText(row.collectedAt, props.now)} · <Link className="data-link" href={`/runs/${encodeURIComponent(row.runId)}`}>run</Link>
      </span>
    </li>
  );
}
