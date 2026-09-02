"use client";

import { AlertTriangle, ArrowLeft, RefreshCcw } from "lucide-react";
import Link from "next/link";

export function RouteErrorSurface(props: { error: Error & { digest?: string }; reset(): void; title: string; description: string; backHref?: string; backLabel?: string }) {
  return <main className="console-main single-program">
    <section className="route-recovery-surface" role="alert">
      <span className="program-icon"><AlertTriangle aria-hidden size={20} /></span>
      <div>
        <p className="page-kicker">Unable to load</p>
        <h1 className="page-title">{props.title}</h1>
        <p className="page-copy">{props.description}</p>
        {props.error.digest ? <p className="route-error-reference">Error reference: <code>{props.error.digest}</code></p> : null}
        <div className="inline-actions">
          <button className="button button-primary" onClick={props.reset} type="button"><RefreshCcw aria-hidden size={15} />Retry</button>
          <Link className="button" href={props.backHref ?? "/"}><ArrowLeft aria-hidden size={15} />{props.backLabel ?? "Back to Programs"}</Link>
        </div>
      </div>
    </section>
  </main>;
}
