"use client";

import { AlertTriangle, CheckCircle2, Circle, Info, XCircle } from "lucide-react";
import { fluxiqStatusLabel, fluxiqStatusTone } from "fluxiq/ui";

export function StatusBadge(props: { value: string }) {
  const tone = fluxiqStatusTone(props.value);
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "danger" ? XCircle : tone === "info" ? Info : Circle;
  return <span className={`status-badge-pill tone-${tone}`} title={props.value}><Icon size={12} aria-hidden /><span>{fluxiqStatusLabel(props.value)}</span></span>;
}
