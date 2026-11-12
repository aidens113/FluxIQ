import { agoText } from "../../home/model";
import type { KeyRow } from "../model";

function lockText(row: KeyRow): string {
  if (!row.enabled) return "Turned off";
  if (row.lock === "locked") return "Locked";
  if (row.lock === "unlocked") return "Unlocked";
  return "Lock state not known";
}

/** The keys' names and facts. A key's value is never fetched, so it cannot be drawn. */
export function KeysList(props: { rows: KeyRow[]; now: number }) {
  if (props.rows.length === 0) return <p className="security-note">No keys yet. A model-provider key you add shows up here.</p>;
  return (
    <ul className="security-list" aria-label="Keys">
      {props.rows.map((row) => (
        <li key={row.id} className="security-row">
          <span className="security-title">{row.name}</span>
          <span className="security-state" data-tone={row.lock === "locked" ? "warn" : row.lock === "unlocked" ? "ok" : "none"}>{lockText(row)}</span>
          <span className="security-muted">{row.provider} · added {agoText(row.addedAt, props.now)} · last revealed {row.lastRevealedAt === undefined ? "never" : agoText(row.lastRevealedAt, props.now)}</span>
        </li>
      ))}
    </ul>
  );
}
