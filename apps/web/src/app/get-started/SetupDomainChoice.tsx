import type { SetupDomain } from "./resolve-setup-domain";

/**
 * Shown by first-run setup when several domains are installed and the runtime
 * names none: each project belongs to one domain, so the person picks which
 * one this setup is for before starting.
 */
export function SetupDomainChoice(props: { domains: SetupDomain[] }) {
  return <main className="directory-page">
    <div className="directory-container">
      <header className="directory-heading">
        <p className="page-kicker">Get started</p>
        <h1 className="page-title">Choose a domain</h1>
        <p className="page-copy">Each automation project belongs to one domain. Choose the one you want to set up.</p>
      </header>
      <ul aria-label="Installed domains">
        {props.domains.map((domain) => <li key={domain.id}>
          <a className="button button-secondary" href={`/get-started?${new URLSearchParams({ domainId: domain.id })}`}>{domain.title}</a>
          <p className="page-copy">{domain.description}</p>
        </li>)}
      </ul>
    </div>
  </main>;
}
