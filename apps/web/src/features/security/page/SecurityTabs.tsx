import { SECURITY_TABS, type SecurityTabId } from "./security-tabs";

/** The tab bar under the Security heading: one link per place, the current one marked. */
export function SecurityTabs(props: { active: SecurityTabId }) {
  return (
    <nav className="security-tabs" aria-label="Security sections">
      {SECURITY_TABS.map((tab) => (
        <a key={tab.id} className="security-tab" href={tab.href} {...(tab.id === props.active ? { "aria-current": "page" as const } : {})}>{tab.label}</a>
      ))}
    </nav>
  );
}
