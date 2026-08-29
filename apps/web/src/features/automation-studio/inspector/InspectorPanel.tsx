"use client";

import { Check, Copy, ExternalLink, ListChecks, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { SummaryStrip } from "../../programs/shared-ui";
import { useUiRenderMetric } from "../../programs/ui-performance";
import type { AutomationSelection } from "../shared/selection-contracts";
import { InspectorFilterProvider, InspectorSection } from "./InspectorSection";
import type { InspectorIdentity, InspectorPanelModel } from "./types";

export function InspectorPanel(props: {
  identity: InspectorIdentity | null;
  model: InspectorPanelModel | null;
  selection: AutomationSelection | null;
  stateNodeId: string;
  onOpenState(): void;
}) {
  useUiRenderMetric("AutomationStudioSelectionBoundary");
  const [searchQuery, setSearchQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => setSearchQuery(""), [props.identity?.id]);
  const copySelectionId = async () => {
    if (!props.identity?.id) return;
    try {
      await navigator.clipboard.writeText(props.identity.id);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1_500);
    } catch {
      setCopyStatus("Copy failed");
    }
  };
  return (
    <aside className="automation-inspector">
      <header className="automation-inspector-identity">
        <span>Inspector</span>
        <strong>{props.identity?.title ?? "No selection"}</strong>
        {props.identity ? <small>{props.identity.label}</small> : null}
        {props.identity?.breadcrumb.length ? <nav aria-label="Selected object path">{props.identity.breadcrumb.map((item, index) => <span key={item}>{index ? " / " : ""}{item}</span>)}</nav> : null}
      </header>
      {props.identity ? <div className="automation-inspector-tools">
        <button aria-label="Copy selected object ID" className="button" onClick={() => void copySelectionId()} title="Copy selected object ID" type="button">{copyStatus === "Copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copyStatus || "Copy ID"}</button>
        {props.identity.href && props.identity.openLabel ? <a className="button" href={props.identity.href}><ExternalLink size={14} aria-hidden />{props.identity.openLabel}</a> : null}
      </div> : null}
      <div className="automation-inspector-search">
        <Search size={14} aria-hidden />
        <input aria-label="Search inspector fields" disabled={!props.identity} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search fields" type="search" value={searchQuery} />
      </div>
      {!props.identity ? <div className="automation-inspector-empty"><Search size={22} aria-hidden /><strong>Select an object to inspect</strong><span>Choose a Flow, node, route, recording, event, run, state fact, or other workspace object.</span></div> : (
        <InspectorFilterProvider query={searchQuery}>
          {searchQuery ? <p className="automation-inspector-filter-status">Showing fields matching <strong>{searchQuery}</strong></p> : null}
          {props.stateNodeId ? <button className="button automation-inspector-action" onClick={props.onOpenState} type="button"><ListChecks size={14} aria-hidden />Open State</button> : null}
          {props.model?.customContent}
          {props.model?.widgets?.map((widget, index) => <InspectorWidget key={`${widget.kind}:${widget.title}:${index}`} query={searchQuery} widget={widget} />)}
          {props.model?.sections.map((section, index) => <InspectorSection key={`${section.title}:${index}`} title={section.title} rows={section.rows} />)}
          {props.model?.provenance ? <section className="automation-provenance-card"><strong>Value Provenance</strong><span>Current: {props.model.provenance.current}</span><small>{props.model.provenance.source}</small></section> : null}
        </InspectorFilterProvider>
      )}
    </aside>
  );
}

function InspectorWidget(props: { query: string; widget: any }) {
  const query = props.query.trim().toLocaleLowerCase();
  const titleMatches = props.widget.title.toLocaleLowerCase().includes(query);
  if (props.widget.kind === "summary") {
    const items = query && !titleMatches ? props.widget.items.filter(([label, value]: [string, string]) => (label + " " + value).toLocaleLowerCase().includes(query)) : props.widget.items;
    if (query && items.length === 0) return null;
    return <section className="automation-inspector-widget"><strong>{props.widget.title}</strong><SummaryStrip items={items} /></section>;
  }
  const items = query && !titleMatches ? props.widget.items.filter((item: Record<string, unknown>) => Object.values(item).some((value) => String(value ?? "").toLocaleLowerCase().includes(query))) : props.widget.items;
  if (query && items.length === 0) return null;
  return <section className="automation-inspector-widget"><strong>{props.widget.title}</strong><div className="automation-inspector-card-list">{items.map((item: any) => <article key={item.title + ":" + (item.meta ?? "")}><span>{item.meta ?? "Item"}</span><strong>{item.title}</strong><p>{item.detail}</p></article>)}</div></section>;
}