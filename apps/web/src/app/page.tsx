import { Blocks, Database, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import { defaultGlobalProgramCatalog } from "fluxiq";

const icons = {
  "automation-studio": Blocks,
  "flow-editor": Workflow,
  data: Database,
  "identity-access": ShieldCheck,
  compute: GitBranch
};

export default function HomePage() {
  const programs = defaultGlobalProgramCatalog();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">FluxIQ</div>
        <nav className="nav-list" aria-label="Programs">
          {programs.map((program) => {
            const Icon = icons[program.id as keyof typeof icons] ?? Blocks;
            return (
              <a className="nav-item active" href={program.route} key={program.id}>
                <Icon size={18} aria-hidden />
                <span>{program.title}</span>
              </a>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="page-header">
          <div>
            <h1 className="page-title">Framework Control Panel</h1>
            <p className="page-copy">
              Domain-neutral foundation for automation studios, flow authoring,
              identity, data management, and compute orchestration.
            </p>
          </div>
          <span className="badge">Public framework</span>
        </header>
        <section className="grid" aria-label="Program directory">
          {programs.map((program) => (
            <article className="card" key={program.id}>
              <h2 className="card-title">{program.title}</h2>
              <p className="card-copy">{program.description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
