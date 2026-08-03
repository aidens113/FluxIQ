import {
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
import { AuthStatus, LoginPanel } from "./AuthShell";
import { currentFluxIQUser } from "../lib/auth";
import { getFluxIQ } from "../lib/fluxiq";

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

const categoryOrder = new Map<string, number>([
  ["Authoring", 0],
  ["Framework Control", 1],
  ["Runtime Control", 2],
  ["Domain Control", 3]
]);

export default async function HomePage() {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;

  const fluxiq = getFluxIQ();
  const activeDomain = fluxiq.activeDomainId ? fluxiq.programDirectory(fluxiq.activeDomainId).domain : null;
  const domainName = activeDomain?.title ?? fluxiq.activeDomainId ?? "Global";
  const programs = defaultGlobalProgramCatalog();
  const groups = groupPrograms(programs);

  return (
    <main className="directory-page">
      <header className="directory-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Blocks size={17} aria-hidden />
          </span>
          <span>FluxIQ - {domainName}</span>
        </div>
        <AuthStatus displayName={auth.user.displayName} roleId={auth.user.roleId} />
      </header>

      <div className="directory-container">
        <section className="directory-heading">
          <p className="page-kicker">{fluxiq.activeDomainId ? "Domain console" : "Framework console"}</p>
          <h1 className="page-title">{domainName} Programs</h1>
          <p className="page-copy">
            Open FluxIQ programs for automation authoring, identity, data,
            compute, deployments, documentation, scheduling, and production runs.
          </p>
        </section>

        <section className="program-category-list" aria-label="Global program directory">
          {groups.map((group) => (
            <section className="program-category-section" key={group.category}>
              <div className="program-category-heading">
                <h2>{group.category}</h2>
                <span>
                  {group.programs.length} program{group.programs.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="program-grid">
                {group.programs.map((program) => (
                  <ProgramCard key={program.id} program={program} />
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}

function ProgramCard({ program }: { program: ProgramSummary }) {
  const Icon = icons[program.icon];

  return (
    <a className="program-card" href={program.route}>
      <span className="program-icon">
        <Icon size={18} aria-hidden />
      </span>
      <span className="program-card-copy">
        <strong>{program.title}</strong>
        <span>{program.category}</span>
        <p>{program.description}</p>
      </span>
    </a>
  );
}

function groupPrograms(programs: ProgramSummary[]): Array<{ category: string; programs: ProgramSummary[] }> {
  const groups = new Map<string, ProgramSummary[]>();
  for (const program of programs) {
    groups.set(program.category, [...(groups.get(program.category) ?? []), program]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => categoryRank(left) - categoryRank(right) || left.localeCompare(right))
    .map(([category, categoryPrograms]) => ({
      category,
      programs: categoryPrograms.sort((left, right) => left.title.localeCompare(right.title))
    }));
}

function categoryRank(category: string): number {
  return categoryOrder.get(category) ?? 99;
}
