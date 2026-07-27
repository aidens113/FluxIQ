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

type WorkspaceTab = "main" | "api" | "storage" | "runtime";

type ProgramWorkspaceProps = {
  program: ProgramSummary;
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

export function ProgramWorkspace({ program, capabilities }: ProgramWorkspaceProps) {
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

        {tab === "main" ? <MainProgramUi programId={program.id} /> : null}
        {tab === "api" ? <CapabilityPanel title="API" items={capabilities.api} /> : null}
        {tab === "storage" ? <CapabilityPanel title="Storage" items={capabilities.storage} /> : null}
        {tab === "runtime" ? <CapabilityPanel title="Runtime" items={capabilities.runtime} /> : null}
      </div>
    </main>
  );
}

function MainProgramUi({ programId }: { programId: string }) {
  switch (programId) {
    case "identity-access":
      return <IdentityAccessMain />;
    case "database-manager":
      return <DatabaseManagerMain />;
    case "background-tasks":
      return <BackgroundTasksMain />;
    case "compute-control":
      return <ComputeControlMain />;
    case "deployment-sync":
      return <DeploymentSyncMain />;
    case "docs":
      return <DocsMain />;
    case "production-runner":
      return <ProductionRunnerMain />;
    default:
      return <GenericProgramMain />;
  }
}

function IdentityAccessMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Users" action="New user">
        <DataTable
          columns={["User", "Role", "2FA", "Last update"]}
          empty="No framework users have been created yet."
        />
      </Panel>
      <Panel title="Roles">
        <DataTable columns={["Role", "Permissions"]} rows={[["admin", "All framework permissions"], ["viewer", "Read-only program access"]]} />
      </Panel>
      <Panel title="Vault">
        <KeyValue rows={[["Initialized", "No"], ["Unlocked", "No"], ["Unlocked by", "-"]]} />
      </Panel>
    </section>
  );
}

function DatabaseManagerMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Stores" action="Register store">
        <DataTable columns={["Store", "Scope", "Records"]} empty="No repositories registered yet." />
      </Panel>
      <Panel title="Records">
        <div className="field-row">
          <label>
            <span>Store</span>
            <select><option>Select a store</option></select>
          </label>
          <label>
            <span>Scope</span>
            <select><option>Global</option></select>
          </label>
        </div>
        <DataTable columns={["ID", "Kind", "Updated"]} empty="Select a store to browse records." />
      </Panel>
      <Panel title="Migrations">
        <DataTable columns={["Migration", "Description"]} empty="No migrations registered yet." />
      </Panel>
    </section>
  );
}

function BackgroundTasksMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Task Queue" action="Run selected">
        <DataTable columns={["Task", "Queue", "Schedule", "Controls"]} empty="No background tasks registered yet." />
      </Panel>
      <Panel title="Recent Runs">
        <DataTable columns={["Run", "Task", "Duration", "Result"]} empty="No task runs recorded yet." />
      </Panel>
      <Panel title="Schedule Controls">
        <div className="field-row">
          <label>
            <span>Interval</span>
            <input placeholder="300" />
          </label>
          <label>
            <span>Queue</span>
            <input placeholder="default" />
          </label>
        </div>
      </Panel>
    </section>
  );
}

function ComputeControlMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Compute Nodes">
        <DataTable columns={["Node", "Host", "Capabilities", "Heartbeat"]} empty="No compute nodes connected yet." />
      </Panel>
      <Panel title="Capacity">
        <KeyValue rows={[["Online nodes", "0"], ["Busy nodes", "0"], ["Available leases", "0"]]} />
      </Panel>
      <Panel title="Command Queue" action="Queue command">
        <DataTable columns={["Command", "Target", "Created"]} empty="No pending commands." />
      </Panel>
    </section>
  );
}

function DeploymentSyncMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Targets" action="Add target">
        <DataTable columns={["Target", "Environment", "Last sync"]} empty="No deployment targets configured yet." />
      </Panel>
      <Panel title="Artifacts">
        <DataTable columns={["Artifact", "Kind", "Version"]} empty="No sync artifacts registered yet." />
      </Panel>
      <Panel title="Sync Runs">
        <DataTable columns={["Run", "Target", "Result"]} empty="No sync runs recorded yet." />
      </Panel>
    </section>
  );
}

function DocsMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Documentation Sources" action="Add source">
        <DataTable columns={["Source", "Scope", "Root"]} empty="No documentation sources registered yet." />
      </Panel>
      <Panel title="Pages">
        <DataTable columns={["Page", "Source", "Updated"]} empty="No documentation pages indexed yet." />
      </Panel>
      <Panel title="Generated Docs">
        <DataTable columns={["Document", "Generated"]} empty="No generated docs available yet." />
      </Panel>
    </section>
  );
}

function ProductionRunnerMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Runs" action="Start run">
        <DataTable columns={["Run", "Target", "Started", "Controls"]} empty="No production runs started yet." />
      </Panel>
      <Panel title="Targets">
        <div className="field-row">
          <label>
            <span>Type</span>
            <select><option>Task</option><option>Routine</option><option>Interface</option><option>Flow</option></select>
          </label>
          <label>
            <span>Domain</span>
            <select><option>Global</option></select>
          </label>
        </div>
        <DataTable columns={["Target", "Type", "Domain"]} empty="No runnable targets discovered yet." />
      </Panel>
      <Panel title="History">
        <DataTable columns={["Run", "Result", "Stopped"]} empty="No completed run history yet." />
      </Panel>
    </section>
  );
}

function GenericProgramMain() {
  return (
    <section className="program-workspace-grid">
      <Panel title="Workspace">
        <DataTable columns={["Item", "Updated"]} empty="No records available yet." />
      </Panel>
    </section>
  );
}

function Panel(props: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="panel workspace-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{props.title}</h2>
        {props.action ? <button className="button" type="button">{props.action}</button> : null}
      </div>
      {props.children}
    </section>
  );
}

function DataTable(props: { columns: string[]; rows?: string[][]; empty?: string }) {
  const rows = props.rows ?? [];
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {props.columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.join(":")}>
              {row.map((cell, index) => <td key={`${cell}:${index}`}>{cell}</td>)}
            </tr>
          )) : (
            <tr>
              <td className="empty-cell" colSpan={props.columns.length}>{props.empty ?? "No data available."}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function KeyValue(props: { rows: Array<[string, string]> }) {
  return (
    <dl className="key-value-list">
      {props.rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
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
