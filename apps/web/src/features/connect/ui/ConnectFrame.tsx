import type { ReactNode } from "react";

export function ConnectFrame({ title, children }: { title: string; children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card" aria-labelledby="connect-heading">
    <p>FluxIQ</p>
    <h1 className="auth-title" id="connect-heading">{title}</h1>
    {children}
  </section></main>;
}
