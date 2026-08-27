"use client";

import { Blocks, BookOpen, CalendarClock, ChevronRight, CloudUpload, Database, GitBranch, KeyRound, MousePointerClick, PlayCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { FluxIQIconName, ProgramSummary } from "fluxiq";
import { EmptyState } from "../features/programs/shared-ui";

export type LaunchDomain = { id: string; title: string; category: string; description: string; route: string; status: string; icon: string };

const icons = {
  blocks: Blocks,
  "book-open": BookOpen,
  "calendar-clock": CalendarClock,
  "cloud-upload": CloudUpload,
  database: Database,
  "git-branch": GitBranch,
  "key-round": KeyRound,
  "play-circle": PlayCircle,
  "shield-check": ShieldCheck
} satisfies Record<FluxIQIconName, typeof Blocks>;

const domainIcons: Record<string, typeof Blocks> = { "mouse-pointer-click": MousePointerClick };
const categoryOrder = new Map<string, number>([["Authoring", 0], ["Framework Control", 1], ["Runtime Control", 2], ["Domain Control", 3]]);
const recentStorageKey = "fluxiq:recent-programs";

type LauncherItem = { id: string; title: string; description: string; category: string; href: string; icon: typeof Blocks; meta?: string };

export function ProgramLauncher(props: { domains?: LaunchDomain[]; programs: ProgramSummary[]; label: string }) {
  const [query, setQuery] = useState("");
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(recentStorageKey) ?? "[]");
      if (Array.isArray(stored)) setRecentHrefs(stored.filter((value): value is string => typeof value === "string").slice(0, 6));
    } catch {
      setRecentHrefs([]);
    }
  }, []);

  const items = useMemo<LauncherItem[]>(() => [
    ...(props.domains ?? []).map((domain) => ({
      id: `domain:${domain.id}`,
      title: domain.title,
      description: domain.description,
      category: "Domains",
      href: domain.route,
      icon: domainIcons[domain.icon] ?? Blocks,
      meta: domain.status
    })),
    ...props.programs.map((program) => ({
      id: `program:${program.id}`,
      title: program.title,
      description: program.description,
      category: program.category,
      href: program.route,
      icon: icons[program.icon]
    }))
  ], [props.domains, props.programs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => !needle || [item.title, item.description, item.category, item.meta].some((value) => value?.toLowerCase().includes(needle)));
  }, [items, query]);
  const recent = recentHrefs.map((href) => filtered.find((item) => item.href === href)).filter((item): item is LauncherItem => Boolean(item));
  const grouped = groupItems(filtered.filter((item) => !recent.some((entry) => entry.href === item.href)));

  function remember(href: string) {
    const next = [href, ...recentHrefs.filter((item) => item !== href)].slice(0, 6);
    setRecentHrefs(next);
    window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>(".launcher-row"));
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowUp" ? Math.max(0, current - 1) : Math.min(links.length - 1, current + 1);
    links[index]?.focus();
  }

  return (
    <section aria-label={props.label} className="program-launcher">
      <label className="launcher-search">
        <Search aria-hidden size={16} />
        <span className="visually-hidden">Search programs and domains</span>
        <input autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Search programs and domains" type="search" value={query} />
      </label>
      <div className="launcher-results" onKeyDown={moveFocus}>
        {!filtered.length ? <EmptyState compact description="Try a different name, category, or capability." icon={<Search size={18} />} title="No matching programs" /> : <>
          {recent.length ? <LauncherGroup items={recent} onOpen={remember} title="Recent" /> : null}
          {grouped.map((group) => <LauncherGroup items={group.items} key={group.category} onOpen={remember} title={group.category} />)}
        </>}
      </div>
    </section>
  );
}

function LauncherGroup(props: { title: string; items: LauncherItem[]; onOpen(href: string): void }) {
  return (
    <section className="launcher-group">
      <header><h2>{props.title}</h2><span>{props.items.length}</span></header>
      <div className="launcher-list">
        {props.items.map((item) => {
          const Icon = item.icon;
          return <a className="launcher-row" href={item.href} key={item.id} onClick={() => props.onOpen(item.href)}>
            <span className="launcher-icon"><Icon aria-hidden size={17} /></span>
            <span className="launcher-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
            <span className="launcher-meta">{item.meta ?? item.category}</span>
            <ChevronRight aria-hidden size={15} />
          </a>;
        })}
      </div>
    </section>
  );
}

function groupItems(items: LauncherItem[]): Array<{ category: string; items: LauncherItem[] }> {
  const groups = new Map<string, LauncherItem[]>();
  items.forEach((item) => groups.set(item.category, [...(groups.get(item.category) ?? []), item]));
  return [...groups.entries()]
    .sort(([left], [right]) => (categoryOrder.get(left) ?? (left === "Domains" ? -1 : 99)) - (categoryOrder.get(right) ?? (right === "Domains" ? -1 : 99)) || left.localeCompare(right))
    .map(([category, values]) => ({ category, items: values.sort((left, right) => left.title.localeCompare(right.title)) }));
}