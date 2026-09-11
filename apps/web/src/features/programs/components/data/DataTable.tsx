"use client";

import type { ReactNode } from "react";

export function DataTable(props: {
  columns: string[];
  rows?: Array<Array<ReactNode>>;
  rowKeys?: string[];
  empty?: string;
  label: string;
  compact?: boolean;
  loading?: boolean;
}) {
  const rows = props.rows ?? [];
  return (
    <div aria-busy={props.loading || undefined} className={`table-wrap${props.compact ? " compact" : ""}`}>
      <table aria-label={props.label} className="data-table">
        <caption className="visually-hidden">{props.label}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={props.rowKeys?.[rowIndex] ?? rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="empty-cell" colSpan={props.columns.length}>
                {props.loading ? "Loading rows..." : props.empty ?? "No data available."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
