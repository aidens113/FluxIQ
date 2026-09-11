"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { GlobalAlertPayload } from "./notifyGlobalAlert";

type GlobalAlertItem = Required<Pick<GlobalAlertPayload, "tone" | "message">> & {
  id: string;
  title?: string;
  createdAt: number;
  ttlMs: number;
  actionLabel?: string;
  onAction?: () => void;
};

export function GlobalAlertViewport() {
  const [alerts, setAlerts] = useState<GlobalAlertItem[]>([]);
  const [pausedIds, setPausedIds] = useState<Set<string>>(() => new Set());
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
        ttlMs,
        ...(detail.actionLabel ? { actionLabel: detail.actionLabel } : {}),
        ...(detail.onAction ? { onAction: detail.onAction } : {})
      };
      setAlerts((current) => [alert, ...current.filter((item) => item.id !== key)].slice(0, 4));
    };
    window.addEventListener("fluxiq:global-alert", onAlert);
    return () => window.removeEventListener("fluxiq:global-alert", onAlert);
  }, []);
  useEffect(() => {
    if (!alerts.length) return;
    const timers = alerts.filter((alert) => !pausedIds.has(alert.id)).map((alert) => window.setTimeout(() => {
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    }, alert.ttlMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alerts, pausedIds]);
  if (!alerts.length) return null;
  return (
    <div className="global-alert-viewport" aria-label="Notifications">
      {alerts.map((alert) => (
        <GlobalAlertCard
          key={alert.id}
          alert={alert}
          onDismiss={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}
          onPause={(paused) => setPausedIds((current) => {
            const next = new Set(current);
            if (paused) next.add(alert.id);
            else next.delete(alert.id);
            return next;
          })}
        />
      ))}
    </div>
  );
}

function GlobalAlertCard(props: { alert: GlobalAlertItem; onDismiss(): void; onPause(paused: boolean): void }) {
  const Icon = props.alert.tone === "success" ? CheckCircle2 : props.alert.tone === "warning" ? AlertTriangle : props.alert.tone === "error" ? XCircle : Info;
  return (
    <div
      className={`global-alert ${props.alert.tone}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) props.onPause(false);
      }}
      onFocus={() => props.onPause(true)}
      onMouseEnter={() => props.onPause(true)}
      onMouseLeave={() => props.onPause(false)}
      role={props.alert.tone === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden />
      <span>
        {props.alert.title ? <strong>{props.alert.title}</strong> : null}
        <small>{props.alert.message}</small>
      </span>
      {props.alert.actionLabel && props.alert.onAction ? (
        <button className="global-alert-action" onClick={() => { props.alert.onAction?.(); props.onDismiss(); }} type="button">
          {props.alert.actionLabel}
        </button>
      ) : null}
      <button className="global-alert-dismiss" onClick={props.onDismiss} title="Dismiss notification" aria-label="Dismiss notification" type="button">
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
