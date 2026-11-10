import Link from "next/link";
import { runFacts, type RunRow } from "../model";

/** One run: its result and Flow as the link, the small facts beneath. */
export function RunsListRow(props: { row: RunRow; now: number }) {
  const facts = runFacts(props.row, props.now);
  return (
    <li className="runs-row">
      <Link className="runs-link" href={`/runs/${encodeURIComponent(props.row.runId)}`} aria-label={`Open the run of ${facts.flowName}: ${facts.result.label}`}>
        <span className="runs-state" data-tone={facts.result.tone}>{facts.result.label}</span> {facts.flowName}
      </Link>
      <span className="runs-muted">{facts.details.join(" · ")}</span>
    </li>
  );
}
