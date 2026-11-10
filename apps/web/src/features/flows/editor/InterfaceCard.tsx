"use client";

import type { OutlinePort } from "../wire";

/**
 * What the Flow needs, what it gives back and what it may do. A Flow declared in code shows its
 * interface read-only, with where it is declared when the Flow says: it is changed there.
 */
export function InterfaceCard(props: { needs: readonly OutlinePort[]; gives: readonly OutlinePort[]; may: string; fromCode: boolean; declaredIn?: string }) {
  const ports = (list: readonly OutlinePort[], none: string) => (list.length
    ? list.map((port) => `${port.name} (${port.type}${port.required ? "" : ", optional"})`).join(" · ")
    : none);
  return (
    <section className="flows-card" aria-label="What this Flow needs and gives">
      <dl className="flows-interface">
        <dt>Needs</dt>
        <dd>{ports(props.needs, "Nothing")}</dd>
        <dt>Gives</dt>
        <dd>{ports(props.gives, "Nothing back")}</dd>
        <dt>May</dt>
        <dd>{props.may}</dd>
      </dl>
      {props.fromCode ? (
        <p className="flows-note">
          Declared in code{props.declaredIn ? <>: <code>{props.declaredIn}</code></> : null}. Change what it needs and gives there; its steps can be changed here.
        </p>
      ) : null}
    </section>
  );
}
