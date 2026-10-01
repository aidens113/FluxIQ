"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { useProgramApi } from "../program-api";
type Option = { id: string; label: string };
type Options = { api: ReturnType<typeof useProgramApi>; active: boolean; epoch: string; isOwner(): boolean };
const empty = { domains: [] as Option[], projects: [] as Option[], flows: [] as Option[], projectId: "", loading: false, error: "", catalogError: "", projectError: "" };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function options(value: unknown, kind: "domain" | "project" | "flow"): Option[] | null {
 if (!Array.isArray(value)) return null;
 const result: Option[] = [];
 for (const row of value) {
  if (!object(row)) return null;
  const id = kind === "flow" ? row.flowId : kind === "domain" ? row.id ?? row.domainId : row.id;
  const label = kind === "domain" ? row.title ?? row.name ?? id : row.name;
  if (typeof id !== "string" || !id || typeof label !== "string") return null;
  result.push({ id, label });
 }
 return new Set(result.map(row => row.id)).size === result.length ? result : null;
}
/** Lazy read-only scope choices, scoped to one editor and monotonically numbered project requests. */
export function useSecretScopeCatalog({ api, active, epoch, isOwner }: Options) {
 const [state, setState] = useState(empty);
 const context = useRef({ api, active, epoch }); context.current = { api, active, epoch };
 const mounted = useRef(false), selected = useRef("");
 const selectedEpoch = useRef(epoch);
 const catalog = useRef<AbortController | null>(null), project = useRef<AbortController | null>(null);
 const generation = useRef(0), catalogBusy = useRef(false), projectBusy = useRef(false);
 const current = useCallback(() => mounted.current && isOwner() && context.current.api === api && context.current.active && context.current.epoch === epoch, [api, epoch, isOwner]);
 const cancel = useCallback(() => { catalog.current?.abort(); project.current?.abort(); catalog.current = null; project.current = null; catalogBusy.current = false; projectBusy.current = false; generation.current++; }, []);
 useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(); }; }, [cancel]);
 const retryCatalog = useCallback(async () => {
  if (!current() || catalogBusy.current) return;
  const controller = new AbortController(); catalog.current = controller; catalogBusy.current = true;
  setState(s => ({ ...s, loading: true, catalogError: "", error: s.projectError }));
  try {
   const [response, projects] = await Promise.all([fetch("/api/programs", { cache: "no-store", signal: controller.signal }), api.get<{ projects: unknown }>("projects", { signal: controller.signal })]);
   if (!current() || controller.signal.aborted || catalog.current !== controller) return;
   if (!response.ok || !projects.ok) throw Error("catalog refused");
   const directory: unknown = await response.json();
   if (!current() || controller.signal.aborted || catalog.current !== controller) return;
   const domains = options(object(directory) ? directory.domains : null, "domain"), rows = options(projects.payload?.projects, "project");
   if (!domains || !rows) throw Error("invalid catalog");
   setState(s => ({ ...s, domains, projects: rows, catalogError: "", error: s.projectError }));
  } catch { if (current() && !controller.signal.aborted && catalog.current === controller) setState(s => ({ ...s, catalogError: "Scope choices could not be loaded. Try again.", error: "Scope choices could not be loaded. Try again." })); }
  finally { if (current() && catalog.current === controller) { catalog.current = null; catalogBusy.current = false; setState(s => ({ ...s, loading: projectBusy.current })); } }
 }, [api, current]);
 const loadProject = useCallback(async (projectId: string) => {
  if (!current()) return;
  project.current?.abort(); const asked = ++generation.current; const previousProject = selected.current; selected.current = projectId; selectedEpoch.current = epoch;
  projectBusy.current = Boolean(projectId); setState(s => ({ ...s, projectId, flows: previousProject === projectId ? s.flows : [], projectError: "", error: s.catalogError, loading: Boolean(projectId) || catalogBusy.current }));
  if (!projectId) { project.current = null; return; }
  const controller = new AbortController(); project.current = controller;
  const valid = () => current() && asked === generation.current && selected.current === projectId && project.current === controller && !controller.signal.aborted;
  try {
   const result = await api.post<{ flows: unknown }>("list-flow-summaries", { projectId }, { signal: controller.signal });
   if (!valid()) return;
   const flows = result.ok ? options(result.payload?.flows, "flow") : null;
   if (!flows) throw Error("invalid flows");
   setState(s => ({ ...s, flows, projectError: "", error: s.catalogError }));
  } catch { if (valid()) setState(s => ({ ...s, projectError: "Project flows could not be loaded. Try again.", error: "Project flows could not be loaded. Try again." })); }
  finally { if (valid()) { project.current = null; projectBusy.current = false; setState(s => ({ ...s, loading: catalogBusy.current })); } }
 }, [api, current]);
 const retryProject = useCallback(() => { if (current() && selectedEpoch.current === epoch && !projectBusy.current) return loadProject(selected.current); }, [current, epoch, loadProject]);
 const previousEpoch = useRef(epoch);
 useEffect(() => {
  cancel();
  if (previousEpoch.current !== epoch) { previousEpoch.current = epoch; selected.current = ""; selectedEpoch.current = epoch; setState(empty); }
  if (active) { void retryCatalog(); if (selected.current) void loadProject(selected.current); }
  return cancel;
 }, [active, epoch, retryCatalog, loadProject, cancel]);
 const shown = previousEpoch.current === epoch ? state : empty;
 return { ...shown, loading: active && shown.loading, error: shown.catalogError || shown.projectError, loadProject, retryCatalog, retryProject };
}
