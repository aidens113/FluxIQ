"use client";

import { ChevronDown, ChevronRight, Search, Star } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { AutomationEditorNodeSpec, AutomationEditorPaletteGroup } from "./node-types";
import { automationNodeIcon } from "./palette-icons";
import { automationNodeCompatibilityHint } from "./palette-model";
import { browserNodePalettePreferencesRepository, type NodePalettePreferencesRepository } from "./palette-preferences-repository";
export const FlowNodePalette = memo(function FlowNodePalette(props: {
  collapsed: boolean;
  id: string;
  disabled?: boolean;
  groups: AutomationEditorPaletteGroup[];
  focusRevision?: number;
  title: string;
  onAddNode(spec: AutomationEditorNodeSpec): void;
  onCollapsedChange(value: boolean): void;
  preferencesRepository?: NodePalettePreferencesRepository;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [materialization, setMaterialization] = useState({ signature: "", count: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const allNodes = useMemo(() => props.groups.flatMap((group) => group.nodes), [props.groups]);
  const byId = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);

  useEffect(() => {
    setFavorites((props.preferencesRepository ?? browserNodePalettePreferencesRepository).readFavorites());
  }, [props.preferencesRepository]);
  useEffect(() => {
    setFavorites((current) => {
      const available = current.filter((id, index) => byId.has(id) && current.indexOf(id) === index);
      if (available.length === current.length) return current;
      (props.preferencesRepository ?? browserNodePalettePreferencesRepository).saveFavorites(available);
      return available;
    });
  }, [byId, props.preferencesRepository]);
  useEffect(() => {
    if (props.focusRevision) searchRef.current?.focus();
  }, [props.focusRevision]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sourceGroups = mode === "all"
    ? props.groups
    : [{
      title: mode === "favorites" ? "Favorites" : "Recent",
      nodes: (mode === "favorites" ? favorites : recent).map((id) => byId.get(id)).filter((node): node is AutomationEditorNodeSpec => Boolean(node))
    }];
  const visibleGroups = sourceGroups.map((group) => ({
    ...group,
    nodes: group.nodes.filter((item) => !normalizedQuery || [
      item.label,
      item.description,
      item.family,
      automationNodeCompatibilityHint(item)
    ].join(" ").toLocaleLowerCase().includes(normalizedQuery))
  })).filter((group) => group.nodes.length > 0);
  const expandedVisibleGroups = visibleGroups.filter((group) => mode !== "all"
    || Boolean(normalizedQuery)
    || !collapsedGroups.includes(group.title));
  const materializationSignature = expandedVisibleGroups.map((group) => [
    group.title,
    ...group.nodes.map((node) => node.id)
  ].join(":")) .join("|");
  const materializedCount = materialization.signature === materializationSignature
    ? materialization.count
    : 0;

  useEffect(() => {
    const total = expandedVisibleGroups.reduce((count, group) => count + group.nodes.length, 0);
    if (!total) {
      setMaterialization({ signature: materializationSignature, count: 0 });
      return;
    }
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setMaterialization({ signature: materializationSignature, count: total });
      return;
    }
    let count = 0;
    let frame = 0;
    const materializeNext = () => {
      count = Math.min(total, count + 1);
      setMaterialization({ signature: materializationSignature, count });
      if (count < total) frame = window.requestAnimationFrame(materializeNext);
    };
    frame = window.requestAnimationFrame(materializeNext);
    return () => window.cancelAnimationFrame(frame);
  }, [materializationSignature]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      (props.preferencesRepository ?? browserNodePalettePreferencesRepository).saveFavorites(next);
      return next;
    });
  };
  const addNode = (item: AutomationEditorNodeSpec) => {
    setRecent((current) => [item.id, ...current.filter((id) => id !== item.id)].slice(0, 12));
    props.onAddNode(item);
  };
  const toggleGroup = (title: string) => setCollapsedGroups((current) => current.includes(title)
    ? current.filter((item) => item !== title)
    : [...current, title]);

  return (
    <aside className={props.collapsed ? "automation-node-palette collapsed" : "automation-node-palette"} aria-label={props.title} id={props.id}>
      <header>
        <strong>{props.title}</strong>
        <button aria-controls={props.id + "-content"} aria-expanded={!props.collapsed} className="icon-button" onClick={() => props.onCollapsedChange(!props.collapsed)} title={props.collapsed ? "Expand palette" : "Collapse palette"} aria-label={props.collapsed ? "Expand palette" : "Collapse palette"} type="button">
          {props.collapsed ? <ChevronLeftIcon /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </header>
      {!props.collapsed ? <div className="automation-node-palette-content" id={props.id + "-content"}>
        <label className="automation-node-palette-search">
          <Search size={14} aria-hidden />
          <input aria-label="Search nodes" onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" ref={searchRef} type="search" value={query} />
        </label>
        <div aria-label="Node palette view" className="automation-node-palette-modes" role="group">
          {(["all", "favorites", "recent"] as const).map((item) => <button aria-pressed={mode === item} className={mode === item ? "selected" : ""} key={item} onClick={() => setMode(item)} type="button">{item === "all" ? "All" : item === "favorites" ? "Favorites" : "Session Recent"}</button>)}
        </div>
        <div className="automation-node-palette-results">
          {(() => {
            let remainingMaterialized = materializedCount;
            return visibleGroups.map((group) => {
            const groupId = `${props.id}-group-${group.title.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const expanded = mode !== "all" || Boolean(normalizedQuery) || !collapsedGroups.includes(group.title);
            const materializedNodes = expanded ? group.nodes.slice(0, remainingMaterialized) : [];
            remainingMaterialized = Math.max(0, remainingMaterialized - materializedNodes.length);
            return (
            <section key={group.title}>
              {mode === "all" && !normalizedQuery ? <button aria-controls={groupId} aria-expanded={expanded} className="automation-node-palette-group-toggle" onClick={() => toggleGroup(group.title)} type="button">
                {expanded ? <ChevronDown aria-hidden size={14} /> : <ChevronRight aria-hidden size={14} />}
                <strong>{group.title}</strong><span>{group.nodes.length}</span>
              </button> : <div className="automation-node-palette-group-label"><strong>{group.title}</strong><span>{group.nodes.length}</span></div>}
              {expanded ? <div className="automation-node-palette-group-items" id={groupId}>{materializedNodes.map((item) => {
                const Icon = automationNodeIcon(item.icon, item.family);
                const favorite = favorites.includes(item.id);
                return (
                  <div className="automation-node-palette-item" key={item.id}>
                    <button className="automation-node-palette-add" disabled={props.disabled} onClick={() => addNode(item)} title={props.disabled ? "This graph is read-only." : item.description} type="button">
                      <Icon size={15} aria-hidden />
                      <span><strong>{item.label}</strong><small>{item.description}</small><small className="automation-node-compatibility">{automationNodeCompatibilityHint(item)}</small></span>
                    </button>
                    <button aria-label={(favorite ? "Remove " : "Add ") + item.label + (favorite ? " from favorites" : " to favorites")} aria-pressed={favorite} className="icon-button automation-node-favorite" onClick={() => toggleFavorite(item.id)} title={favorite ? "Remove favorite" : "Add favorite"} type="button"><Star fill={favorite ? "currentColor" : "none"} size={13} aria-hidden /></button>
                  </div>
                );
              })}</div> : null}
            </section>
          );});})()}
          {!visibleGroups.length ? <p className="automation-node-palette-empty">{mode === "favorites" ? "No favorite nodes. Use the star beside a node to keep it here." : mode === "recent" ? "No nodes added in this session." : "No matching nodes."}</p> : null}
        </div>
      </div> : null}
    </aside>
  );
});
function ChevronLeftIcon() {
  return <ChevronRight size={13} aria-hidden style={{ transform: "rotate(180deg)" }} />;
}
