import { agoText } from "../../home/model";
import { actionLabel, type ActivityEntry } from "./model";

/**
 * Entries newest first: who, what they did, whether it was allowed, what it
 * acted on and when. Every value is drawn as text; an entry carries no secret
 * to hide.
 */
export function ActivityList(props: { entries: readonly ActivityEntry[]; now: number }) {
  return (
    <ol className="security-list activity-list">
      {props.entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="security-row activity-row">
          <span className="activity-line">
            <span className="security-title">{entry.who}</span>
            <span>{actionLabel(entry.action)}</span>
            <span className={`activity-outcome activity-${entry.outcome}`}>{entry.outcome === "allowed" ? "Allowed" : "Denied"}</span>
          </span>
          <span className="security-muted">
            {entry.resources.length > 0 ? `${entry.resources.join(", ")} · ` : ""}
            <time dateTime={new Date(entry.at).toISOString()}>{agoText(entry.at, props.now)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}
