"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type AlertTone = "info" | "success" | "warning" | "error";
type GlobalAlertPayload = { tone: AlertTone; title?: string; message: string; id?: string; ttlMs?: number };
type GlobalAlertItem = Required<Pick<GlobalAlertPayload, "tone" | "message">> & {
  id: string;
  title?: string;
  createdAt: number;
  ttlMs: number;
};

export function notifyGlobalAlert(payload: GlobalAlertPayload) {
  if (typeof window === "undefined" || !payload.message.trim()) return;
  window.dispatchEvent(new CustomEvent<GlobalAlertPayload>("fluxiq:global-alert", { detail: payload }));
}

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

export function Modal(props: { title: string; children: ReactNode; className?: string; onClose(): void }) {
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

export function ModalContent(props: { title: string; children: ReactNode; className?: string; onClose(): void; onKeyDown?(event: KeyboardEvent<HTMLElement>): void }) {
  return (
    <section className={`modal-panel${props.className ? ` ${props.className}` : ""}`} role="dialog" aria-modal="true" onKeyDown={props.onKeyDown}>
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
  useEffect(() => {
    if (!value) return;
    const tone = toneFromMessage(value);
    notifyGlobalAlert({ tone, title: titleFromTone(tone), message: value });
  }, [value]);
  return null;
}

export function VisualAlert(props: { tone: AlertTone; title?: string; message: string }) {
  useEffect(() => {
    notifyGlobalAlert(props);
  }, [props.tone, props.title, props.message]);
  return null;
}

export function GlobalAlertViewport() {
  const [alerts, setAlerts] = useState<GlobalAlertItem[]>([]);
  useEffect(() => {
    const onAlert = (event: Event) => {
      const detail = (event as CustomEvent<GlobalAlertPayload>).detail;
      if (!detail?.message?.trim()) return;
      const key = detail.id ?? `${detail.tone}:${detail.title ?? ""}:${detail.message}`;
      const ttlMs = detail.ttlMs ?? (detail.tone === "error" ? 10_000 : 6_000);
      const alert: GlobalAlertItem = {
        id: key,
        tone: detail.tone,
        ...(detail.title ? { title: detail.title } : {}),
        message: detail.message,
        createdAt: Date.now(),
        ttlMs
      };
      setAlerts((current) => [alert, ...current.filter((item) => item.id !== key)].slice(0, 4));
    };
    window.addEventListener("fluxiq:global-alert", onAlert);
    return () => window.removeEventListener("fluxiq:global-alert", onAlert);
  }, []);
  useEffect(() => {
    if (!alerts.length) return;
    const timers = alerts.map((alert) => window.setTimeout(() => {
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    }, alert.ttlMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alerts]);
  if (!alerts.length) return null;
  return (
    <div className="global-alert-viewport" aria-live="polite" aria-label="Notifications">
      {alerts.map((alert) => (
        <GlobalAlertCard key={alert.id} alert={alert} onDismiss={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))} />
      ))}
    </div>
  );
}

function GlobalAlertCard(props: { alert: GlobalAlertItem; onDismiss(): void }) {
  const Icon = props.alert.tone === "success" ? CheckCircle2 : props.alert.tone === "warning" ? AlertTriangle : props.alert.tone === "error" ? XCircle : Info;
  return (
    <div className={`global-alert ${props.alert.tone}`} role={props.alert.tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden />
      <span>
        {props.alert.title ? <strong>{props.alert.title}</strong> : null}
        <small>{props.alert.message}</small>
      </span>
      <button className="global-alert-dismiss" onClick={props.onDismiss} title="Dismiss notification" aria-label="Dismiss notification" type="button">
        <X size={13} aria-hidden />
      </button>
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
