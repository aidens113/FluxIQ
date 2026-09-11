"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { AlertTone } from "./tone";

export function InlineNotice(props: { tone: AlertTone; title?: string; message: string; action?: ReactNode }) {
  const Icon = props.tone === "success" ? CheckCircle2 : props.tone === "warning" ? AlertTriangle : props.tone === "error" ? XCircle : Info;
  return (
    <div className={`inline-notice ${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden size={16} />
      <span>
        {props.title ? <strong>{props.title}</strong> : null}
        <small>{props.message}</small>
      </span>
      {props.action ? <div className="inline-notice-action">{props.action}</div> : null}
    </div>
  );
}
