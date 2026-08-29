"use client";

import { KeyValue } from "../../programs/shared-ui";

export function DetailSection(props: { title: string; rows: Array<[string, string]>; className?: string }) {
  return <section className={props.className}><strong>{props.title}</strong><KeyValue rows={props.rows} /></section>;
}