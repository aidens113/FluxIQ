"use client";

import {
  Blocks,
  BookOpen,
  CalendarClock,
  CloudUpload,
  Database,
  GitBranch,
  KeyRound,
  PlayCircle,
  ShieldCheck,
  Wrench
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { FluxIQIconName, ProgramSummary } from "fluxiq";
import { AuthStatus } from "../../AuthShell";
import { Breadcrumb, Drawer } from "../../../features/programs/shared-ui";
import { LiveProgramMain } from "./ProgramLiveViews";

type TechnicalTab = "api" | "storage" | "runtime";

type ProgramWorkspaceProps = {
  program: ProgramSummary;
  domainName: string;
  backHref: string;
  backLabel: string;
  user: {
    id: string;
    displayName: string;
    roleId: string;
    totpEnabled: boolean;
    pinConfigured: boolean | undefined;
  };
  capabilities: {
    api: readonly string[];
    storage: readonly string[];
    runtime: readonly string[];
  };
};

const technicalTabLabels: Record<TechnicalTab, string> = {
  api: "API",
  storage: "Storage",
  runtime: "Runtime"
};

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

export function ProgramWorkspace({ program, capabilities, domainName, backHref, backLabel, user }: ProgramWorkspaceProps) {
  const [technicalTab, setTechnicalTab] = useState<TechnicalTab>("api");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const Icon = icons[program.icon];
  const fullscreen = program.id === "automation-studio";
  useEffect(() => {
    if (!technicalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTechnicalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [technicalOpen]);
  if (fullscreen) {
    return (
      <main className="console-main single-program program-fullscreen-shell">
        <header className="console-topbar program-global-topbar">
          <div className="program-topbar-title">
            <span className="program-topbar-icon"><Icon size={16} aria-hidden /></span>
            <Breadcrumb items={[{ label: backLabel, href: backHref }, { label: program.title }]} />
            <span className="program-domain-label">{domainName}</span>
          </div>
          <div className="program-topbar-actions">
            <AuthStatus displayName={user.displayName} roleId={user.roleId} />
          </div>
        </header>
        <LiveProgramMain programId={program.id} user={user} />
      </main>
    );
  }

  return (
    <main className="console-main single-program">
      <header className="console-topbar program-global-topbar">
        <div className="program-topbar-title">
            <span className="program-topbar-icon"><Icon size={16} aria-hidden /></span>
            <Breadcrumb items={[{ label: backLabel, href: backHref }, { label: program.title }]} />
            <span className="program-domain-label">{domainName}</span>
          </div>
        <div className="program-topbar-actions">
          <button className="button program-technical-button" onClick={() => setTechnicalOpen(true)} type="button">
            <Wrench size={15} aria-hidden />
            Technical details
          </button>
          <AuthStatus displayName={user.displayName} roleId={user.roleId} />
        </div>
      </header>
      <div className="console-content program-content">
        <header className="page-header">
          <div className="program-detail-heading">
            <span className="program-icon">
              <Icon size={18} aria-hidden />
            </span>
            <div>
              <p className="page-kicker">{program.category}</p>
              <h1 className="page-title">{program.title}</h1>
              <p className="page-copy">{program.description}</p>
            </div>
          </div>
        </header>
        <MainProgramUi programId={program.id} user={user} />
        {technicalOpen ? <Drawer className="program-technical-content" description={"Framework interfaces exposed by " + program.title + "."} title="Technical details" onClose={() => setTechnicalOpen(false)}>
          <div className="program-tabs" role="tablist" aria-label="Technical detail categories">
            {(Object.keys(technicalTabLabels) as TechnicalTab[]).map((item, index, tabs) => (
              <button
                aria-controls={"technical-panel-" + item}
                aria-selected={technicalTab === item}
                className={technicalTab === item ? "program-tab selected" : "program-tab"}
                id={"technical-tab-" + item}
                key={item}
                onClick={() => setTechnicalTab(item)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : event.key === "ArrowLeft"
                        ? (index - 1 + tabs.length) % tabs.length
                        : (index + 1) % tabs.length;
                  const next = tabs[nextIndex];
                  if (!next) return;
                  setTechnicalTab(next);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
                }}
                role="tab"
                tabIndex={technicalTab === item ? 0 : -1}
                type="button"
              >
                {technicalTabLabels[item]}
              </button>
            ))}
          </div>
          <div aria-labelledby={"technical-tab-" + technicalTab} id={"technical-panel-" + technicalTab} role="tabpanel">
            <CapabilityPanel title={technicalTabLabels[technicalTab]} items={capabilities[technicalTab]} />
          </div>
        </Drawer> : null}
      </div>
    </main>
  );
}

function MainProgramUi({ programId, user }: { programId: string; user: ProgramWorkspaceProps["user"] }) {
  return <LiveProgramMain programId={programId} user={user} />;
}

function CapabilityPanel(props: { title: string; items: readonly string[] }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{props.title}</h2>
      <div className="capability-list">
        {props.items.map((item) => (
          <code key={item}>{item}</code>
        ))}
      </div>
    </section>
  );
}
