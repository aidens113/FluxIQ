"use client";

import { createContext, useContext, type ReactNode } from "react";
import { KeyValue } from "../../programs/shared-ui";
import type { InspectorRow } from "./types";

const InspectorFilterContext = createContext("");

export function InspectorFilterProvider(props: { query: string; children: ReactNode }) {
  return <InspectorFilterContext.Provider value={props.query}>{props.children}</InspectorFilterContext.Provider>;
}

export function InspectorSection(props: { title: string; rows: InspectorRow[] }) {
  const query = useContext(InspectorFilterContext).trim().toLocaleLowerCase();
  const rows = query ? props.rows.filter(([label, value]) => (props.title + " " + label + " " + value).toLocaleLowerCase().includes(query)) : props.rows;
  if (query && rows.length === 0) return null;
  return <details className="automation-inspector-section" open><summary>{props.title}</summary><KeyValue rows={rows} /></details>;
}