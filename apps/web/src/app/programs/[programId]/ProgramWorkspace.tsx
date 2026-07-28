"use client";

import {
  ArrowLeft,
  Blocks,
  BookOpen,
  CalendarClock,
  CloudUpload,
  Database,
  GitBranch,
  PlayCircle,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";
import type { FluxIQIconName, ProgramSummary } from "fluxiq";
import { AuthStatus } from "../../AuthShell";
import { LiveProgramMain } from "./ProgramLiveViews";

type WorkspaceTab = "main" | "api" | "storage" | "runtime";

type ProgramWorkspaceProps = {
  program: ProgramSummary;
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

const tabLabels: Record<WorkspaceTab, string> = {
  main: "Main",
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
  "play-circle": PlayCircle,
  "shield-check": ShieldCheck
} satisfies Record<FluxIQIconName, typeof Blocks>;

export function ProgramWorkspace({ program, capabilities, user }: ProgramWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>("main");
  const Icon = icons[program.icon];

  return (
    <main className="console-main single-program">
      <header className="console-topbar program-global-topbar">
        <div className="program-topbar-title">
          <a className="back-link" href="/" aria-label="Back to programs">
            <ArrowLeft size={16} aria-hidden />
            <span>Programs</span>
          </a>
          <span className="breadcrumb-separator">/</span>
          <span className="program-topbar-icon">
            <Icon size={16} aria-hidden />
          </span>
          <strong>{program.title}</strong>
        </div>
        <div className="program-topbar-actions">
          <div className="program-tabs" role="tablist" aria-label={`${program.title} sections`}>
            {(Object.keys(tabLabels) as WorkspaceTab[]).map((item) => (
              <button
                aria-selected={tab === item}
                className={tab === item ? "program-tab selected" : "program-tab"}
                key={item}
                onClick={() => setTab(item)}
                role="tab"
                type="button"
              >
                {tabLabels[item]}
              </button>
            ))}
          </div>
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

        {tab === "main" ? <MainProgramUi programId={program.id} user={user} /> : null}
        {tab === "api" ? <CapabilityPanel title="API" items={capabilities.api} /> : null}
        {tab === "storage" ? <CapabilityPanel title="Storage" items={capabilities.storage} /> : null}
        {tab === "runtime" ? <CapabilityPanel title="Runtime" items={capabilities.runtime} /> : null}
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
