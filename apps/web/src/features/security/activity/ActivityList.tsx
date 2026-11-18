import { agoText } from "../../home/model";
import { activitySentence, resourceWords, type ActivityEntry } from "./model";

/** "1 item hidden", "3 items hidden": how many items a list request hid from whoever asked. */
function hiddenText(hidden: number): string {
  return `${hidden} ${hidden === 1 ? "item" : "items"} hidden`;
}

/**
 * Entries newest first, each as one plain sentence ("Ada removed the key
 * Work."), with what else it acted on, how many items a list hid from them,
 * and when. Every value is drawn as text; an entry carries no secret to hide
 * and no id is shown.
 */
export function ActivityList(props: { entries: readonly ActivityEntry[]; now: number }) {
  return (
    <ol className="security-list activity-list">
      {props.entries.map((entry, index) => {
        const also = entry.resources.filter((resource) => resourceWords(resource) === resource);
        return (
          <li key={`${entry.at}-${index}`} className="security-row activity-row">
            <span className="activity-line">
              <span className="security-title">{activitySentence(entry)}</span>
              {entry.outcome === "denied" ? <span className="activity-outcome activity-denied">Not allowed</span> : null}
            </span>
            <span className="security-muted">
              {also.length > 0 ? `${also.join(", ")} · ` : ""}
              {entry.hidden === undefined ? "" : `${hiddenText(entry.hidden)} · `}
              <time dateTime={new Date(entry.at).toISOString()}>{agoText(entry.at, props.now)}</time>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
