import { ArrowLeft, Blocks, BookOpen, CalendarClock, CloudUpload, Database, GitBranch, KeyRound, PlayCircle, ShieldCheck } from "lucide-react";
import { defaultGlobalProgramCatalog, type FluxIQIconName, type ProgramSummary } from "fluxiq";
import { notFound } from "next/navigation";
import { AuthStatus, LoginPanel } from "../../AuthShell";
import { currentFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";

const icons = { blocks: Blocks, "book-open": BookOpen, "calendar-clock": CalendarClock, "cloud-upload": CloudUpload, database: Database, "git-branch": GitBranch, "key-round": KeyRound, "play-circle": PlayCircle, "shield-check": ShieldCheck } satisfies Record<FluxIQIconName, typeof Blocks>;
const categoryOrder = new Map([["Authoring", 0], ["Domain Control", 1], ["Runtime Control", 2], ["Framework Control", 3]]);

export default async function DomainPage({ params }: { params: Promise<{ domainId: string }> }) {
  const auth = await currentFluxIQUser();
  if (!auth) return <LoginPanel />;
  const { domainId } = await params;
  const domain = getFluxIQ().programDirectory(domainId).domain;
  if (!domain) notFound();
  const groups = groupPrograms(defaultGlobalProgramCatalog({ domainId: domain.id }));
  return <main className="directory-page">
    <header className="directory-topbar"><div className="domain-topbar-nav"><a className="back-link" href="/"><ArrowLeft size={16} aria-hidden /><span>All domains</span></a><div className="brand-lockup"><span className="brand-mark"><Blocks size={17} aria-hidden /></span><span>FluxIQ - {domain.title}</span></div></div><AuthStatus displayName={auth.user.displayName} roleId={auth.user.roleId} /></header>
    <div className="directory-container">
      <section className="directory-heading">
        <p className="page-kicker">Domain workspace</p><h1 className="page-title">{domain.title}</h1><p className="page-copy">{domain.description}</p>
      </section>
      <section className="program-category-list" aria-label={`${domain.title} program directory`}>
        {groups.map((group) => <section className="program-category-section" key={group.category}>
          <div className="program-category-heading"><h2>{group.category}</h2><span>{group.programs.length} program{group.programs.length === 1 ? "" : "s"}</span></div>
          <div className="program-grid">{group.programs.map((program) => <ProgramCard program={program} key={program.id} />)}</div>
        </section>)}
      </section>
    </div>
  </main>;
}

function ProgramCard({ program }: { program: ProgramSummary }) {
  const Icon = icons[program.icon];
  return <a className="program-card" href={program.route}><span className="program-icon"><Icon size={18} aria-hidden /></span><span className="program-card-copy"><strong>{program.title}</strong><span>{program.category}</span><p>{program.description}</p></span></a>;
}

function groupPrograms(programs: ProgramSummary[]) {
  const groups = new Map<string, ProgramSummary[]>();
  for (const program of programs) groups.set(program.category, [...(groups.get(program.category) ?? []), program]);
  return [...groups.entries()].sort(([left], [right]) => (categoryOrder.get(left) ?? 99) - (categoryOrder.get(right) ?? 99) || left.localeCompare(right)).map(([category, categoryPrograms]) => ({ category, programs: categoryPrograms.sort((left, right) => left.title.localeCompare(right.title)) }));
}
