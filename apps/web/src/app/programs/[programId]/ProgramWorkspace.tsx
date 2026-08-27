"use client";

import {
  ArrowLeft,
  Blocks,
  BookOpen,
  CalendarClock,
  ChevronDown,
  CloudUpload,
  Database,
  GitBranch,
  KeyRound,
  Pause,
  Play,
  PlayCircle,
  Redo2,
  Save,
  ShieldCheck,
  Square,
  StepForward,
  Circle,
  Bug,
  Undo2,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
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
  const [automationStatus, setAutomationStatus] = useState<{ state: string; detail: string; running: boolean; dirty: boolean }>({
    state: "Idle",
    detail: "No active run",
    running: false,
    dirty: false
  });
  const Icon = icons[program.icon];
  const fullscreen = program.id === "automation-studio";
  const setCommandState = (state: string, detail: string, running = false, dirty = automationStatus.dirty) => {
    setAutomationStatus({ state, detail, running, dirty });
  };
  useEffect(() => {
    const onDirtyState = (event: Event) => {
      const dirty = Boolean((event as CustomEvent<{ dirty?: boolean }>).detail?.dirty);
      setAutomationStatus((current) => ({ ...current, dirty, ...(dirty ? { state: "Edited", detail: "Unsaved whiteboard changes" } : {}) }));
    };
    const onCommandStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; detail?: string; running?: boolean; dirty?: boolean }>).detail ?? {};
      setAutomationStatus((current) => ({
        state: detail.state ?? current.state,
        detail: detail.detail ?? current.detail,
        running: detail.running ?? current.running,
        dirty: detail.dirty ?? current.dirty
      }));
    };
    window.addEventListener("automation-studio:dirty-state", onDirtyState);
    window.addEventListener("automation-studio:command-status", onCommandStatus);
    return () => {
      window.removeEventListener("automation-studio:dirty-state", onDirtyState);
      window.removeEventListener("automation-studio:command-status", onCommandStatus);
    };
  }, []);
  useEffect(() => {
    if (!technicalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTechnicalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [technicalOpen]);
  const confirmLeave = (event: MouseEvent<HTMLElement>) => {
    if (automationStatus.dirty && !window.confirm("This task has unsaved whiteboard changes. Leave without saving?")) event.preventDefault();
  };
  const saveAutomationStudio = () => {
    if (!automationStatus.dirty) {
      setCommandState("Saved", "No unsaved Flow changes", false, false);
      return;
    }
    setCommandState("Saving", "Saving selected Flow", true, true);
    let completed = false;
    window.dispatchEvent(new CustomEvent("automation-studio:global-save", {
      detail: {
        onComplete: (result: { ok: boolean; message: string }) => {
          completed = true;
          setCommandState(result.ok ? "Saved" : result.message.toLowerCase().includes("conflict") ? "Conflict" : "Save failed", result.message, false, !result.ok);
        }
      }
    }));
    window.setTimeout(() => {
      if (!completed) setCommandState("Save failed", "No active editor accepted the save command. Your recoverable draft is preserved.", false, true);
    }, 15_000);
  };  const runAutomationStudio = () => {
    setCommandState("Starting", "Checking selected Flow", true, automationStatus.dirty);
    window.dispatchEvent(new CustomEvent("automation-studio:run-flow"));
  };
  const runtimeControl = (command: "Pause" | "Stop") => {
    window.dispatchEvent(new CustomEvent("automation-studio:runtime-control", { detail: { command } }));
  };

  if (fullscreen) {
    return (
      <main className="console-main single-program program-fullscreen-shell">
        <header className="console-topbar program-global-topbar">
          <div className="program-topbar-title">
            <span className="program-topbar-icon"><Icon size={16} aria-hidden /></span>
            <Breadcrumb items={[{ label: backLabel, href: backHref, onClick: confirmLeave }, { label: program.title }]} />
            <span className="program-domain-label">{domainName}</span>
          </div>
          <div className="automation-command-center" aria-label="Automation Studio runtime state">
            <span className={automationStatus.running ? "running" : ""}>{automationStatus.state}</span>
            <strong>{automationStatus.detail}{automationStatus.dirty ? " - unsaved" : ""}</strong>
          </div>
          <div className="automation-main-command-bar" aria-label="Automation Studio commands">
            <IconCommand label="Undo" onClick={() => setCommandState("Edited", "Undo applied", false, true)}><Undo2 size={15} aria-hidden /></IconCommand>
            <IconCommand label="Redo" onClick={() => setCommandState("Edited", "Redo applied", false, true)}><Redo2 size={15} aria-hidden /></IconCommand>
            <IconCommand label="Save" onClick={saveAutomationStudio}><Save size={15} aria-hidden /></IconCommand>
            <span className="command-divider" />
            <button className="button automation-command-menu" onClick={() => setCommandState("Recording", "Capturing operator timeline", true, true)} type="button" title="Record options"><Circle size={13} aria-hidden />Record<ChevronDown size={13} aria-hidden /></button>
            <IconCommand className="run-command" disabled={automationStatus.running} label="Run" onClick={runAutomationStudio}><Play size={15} aria-hidden /></IconCommand>
            <IconCommand disabled={!automationStatus.running} label="Pause" onClick={() => runtimeControl("Pause")}><Pause size={15} aria-hidden /></IconCommand>
            <IconCommand disabled={!automationStatus.running && automationStatus.state !== "Paused"} label="Stop" onClick={() => runtimeControl("Stop")}><Square size={14} aria-hidden /></IconCommand>
            <IconCommand label="Step" onClick={() => setCommandState("Debug Step", "Advanced one policy action", false)}><StepForward size={15} aria-hidden /></IconCommand>
            <IconCommand label="Debug" onClick={() => setCommandState("Debugging", "Debugger armed for selected node", false)}><Bug size={15} aria-hidden /></IconCommand>
            <span className="command-divider" />
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
            <Breadcrumb items={[{ label: backLabel, href: backHref, onClick: confirmLeave }, { label: program.title }]} />
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

function IconCommand(props: { label: string; children: ReactNode; className?: string; disabled?: boolean; onClick(): void }) {
  return <button className={props.className ? `icon-button ${props.className}` : "icon-button"} disabled={props.disabled} onClick={props.onClick} type="button" title={props.label} aria-label={props.label}>{props.children}</button>;
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
