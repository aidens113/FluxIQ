"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";

export type AlertTone = "info" | "success" | "warning" | "error";

export function Panel(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel workspace-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

export function Field(props: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function DataTable(props: { columns: string[]; rows?: Array<Array<ReactNode>>; empty?: string }) {
  const rows = props.rows ?? [];
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="empty-cell" colSpan={props.columns.length}>
                {props.empty ?? "No data available."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValue(props: { rows: Array<[string, string]> }) {
  return (
    <dl className="key-value-list">
      {props.rows.map(([key, value], index) => (
        <div key={`${key}:${index}`}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryStrip(props: { items: Array<[string, string | number]> }) {
  return (
    <div className="summary-strip">
      {props.items.map(([label, value], index) => (
        <div key={`${label}:${index}`}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge(props: { value: string }) {
  return <span className={`status-badge-pill ${props.value.toLowerCase()}`}>{props.value}</span>;
}

export function SpecDatum(props: { label: string; value: string }) {
  return (
    <div className="spec-datum">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Segmented(props: { value: string; options: string[]; onChange(value: string): void }) {
  return (
    <div className="segmented-control">
      {props.options.map((option) => (
        <button className={props.value === option ? "selected" : ""} key={option} onClick={() => props.onChange(option)} type="button">
          {option}
        </button>
      ))}
    </div>
  );
}

export function Modal(props: { title: string; children: ReactNode; onClose(): void }) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const submitButton = event.currentTarget.querySelector<HTMLButtonElement>(
      ".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)",
    );
    if (!submitButton) return;
    event.preventDefault();
    submitButton.click();
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop">
      <ModalContent {...props} onKeyDown={submitOnEnter} />
    </div>,
    document.body,
  );
}

export function ModalContent(props: { title: string; children: ReactNode; onClose(): void; onKeyDown?(event: KeyboardEvent<HTMLElement>): void }) {
  return (
    <section className="modal-panel" role="dialog" aria-modal="true" onKeyDown={props.onKeyDown}>
      <div className="panel-heading">
        <h2 className="panel-title">{props.title}</h2>
        <button className="button" onClick={props.onClose} type="button">
          Close
        </button>
      </div>
      {props.children}
    </section>
  );
}

export function StatusText({ value }: { value: string }) {
  return value ? <VisualAlert tone={toneFromMessage(value)} title={titleFromTone(toneFromMessage(value))} message={value} /> : null;
}

export function VisualAlert(props: { tone: AlertTone; title?: string; message: string }) {
  const Icon = props.tone === "success" ? CheckCircle2 : props.tone === "warning" ? AlertTriangle : props.tone === "error" ? XCircle : Info;
  return (
    <div className={`global-alert ${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden />
      <span>
        {props.title ? <strong>{props.title}</strong> : null}
        <small>{props.message}</small>
      </span>
    </div>
  );
}

export function toneFromMessage(value: string): AlertTone {
  const text = value.toLowerCase();
  if (/\b(failed|failure|error|invalid|must|cannot|required|unknown|disabled|denied)\b/.test(text)) return "error";
  if (/\b(waiting|pending|scheduled|started|running|setup)\b/.test(text)) return "warning";
  if (/\b(created|updated|saved|enabled|finished|rebuilt|started|synced|successful)\b/.test(text)) return "success";
  return "info";
}

export function titleFromTone(tone: AlertTone): string {
  if (tone === "success") return "Success";
  if (tone === "warning") return "Attention";
  if (tone === "error") return "Action failed";
  return "Notice";
}
