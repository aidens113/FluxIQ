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
import { defaultGlobalProgramCatalog, type FluxIQIconName, type ProgramSummary } from "fluxiq";
import { redirect } from "next/navigation";
import { AuthStatus } from "../../AuthShell";
import { currentFluxIQUser } from "../../../lib/auth";
import { ProgramWorkspace } from "./ProgramWorkspace";

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

const programCapabilities = {
  "automation-studio": {
    api: ["snapshot"],
    storage: ["Recording sessions", "Normalized timelines", "Signal registries", "Learned task models", "Policy graphs"],
    runtime: ["Canonical repositories", "Fixture snapshot", "Policy inspection"]
  },
  "background-tasks": {
    api: ["snapshot", "run", "set-enabled"],
    storage: ["Task definitions", "Run history"],
    runtime: ["Task registry", "Task handlers"]
  },
  "compute-control": {
    api: ["snapshot", "command"],
    storage: ["Node inventory", "Commands", "Leases"],
    runtime: ["Heartbeats", "Lease coordination"]
  },
  "database-manager": {
    api: ["snapshot"],
    storage: ["File repositories", "Scoped records"],
    runtime: ["Repository registry", "Migration registry"]
  },
  "deployment-sync": {
    api: ["snapshot", "sync"],
    storage: ["Targets", "Artifacts", "Run history"],
    runtime: ["Sync adapter", "Run coordinator"]
  },
  docs: {
    api: ["snapshot"],
    storage: ["Sources", "Page index"],
    runtime: ["Markdown scanner", "Docs inventory"]
  },
  "identity-access": {
    api: ["snapshot"],
    storage: ["Users", "Roles", "Sessions", "Vault status"],
    runtime: ["Role registry", "Session lifecycle"]
  },
  "production-runner": {
    api: ["snapshot", "start", "stop"],
    storage: ["Run records"],
    runtime: ["Dispatcher", "Run lifecycle"]
  }
} as const;

type ProgramPageParams = {
  params: Promise<{
    programId: string;
  }>;
};

export default async function ProgramPage(context: ProgramPageParams) {
  const auth = await currentFluxIQUser();
  if (!auth) redirect("/");

  const { programId } = await context.params;
  const programs = defaultGlobalProgramCatalog();
  const program = programs.find((item) => item.id === programId);

  if (!program) {
    return <ProgramNotFound programId={programId} />;
  }

  return <ProgramWorkspace
    capabilities={programCapabilities[program.id as keyof typeof programCapabilities] ?? {
      api: ["snapshot"],
      storage: ["Program records"],
      runtime: ["Program service"]
    }}
    program={program}
    user={{
      id: auth.user.id,
      displayName: auth.user.displayName,
      roleId: auth.user.roleId,
      totpEnabled: auth.user.totpEnabled,
      pinConfigured: auth.user.pinConfigured
    }}
  />;
}

function ProgramHeader({ program }: { program: ProgramSummary }) {
  const Icon = icons[program.icon];

  return (
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
  );
}

function ProgramShell(props: { title: string; children: React.ReactNode }) {
  return (
    <main className="console-main single-program">
      <header className="console-topbar">
        <div className="breadcrumbs" aria-label="Breadcrumb">
          <a className="back-link" href="/" aria-label="Back to programs">
            <ArrowLeft size={16} aria-hidden />
            <span>Programs</span>
          </a>
          <span>/</span>
          <strong>{props.title}</strong>
        </div>
        <AuthShellSlot />
      </header>
      <div className="console-content program-content">{props.children}</div>
    </main>
  );
}

async function AuthShellSlot() {
  const auth = await currentFluxIQUser();
  return auth ? <AuthStatus displayName={auth.user.displayName} roleId={auth.user.roleId} /> : null;
}

function ProgramNotFound(props: { programId: string }) {
  return (
    <ProgramShell title="Program not found">
      <section className="panel">
        <h1 className="program-detail-title">Program not found</h1>
        <p className="program-copy">No global program is registered for `{props.programId}`.</p>
      </section>
    </ProgramShell>
  );
}
