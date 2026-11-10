"use client";

import { agoText } from "../../home/model";
import { conflictWords } from "../model";
import type { EditBannerState } from "./use-flow-editor";

/**
 * What the last change came to: "Saved as version N · Undo · Run it whole to test", undone,
 * restored, or "This Flow changed while you were editing … Your change was not saved."
 */
export function EditBanner(props: {
  banner: EditBannerState;
  busy: boolean;
  refusal?: string;
  undo(): void;
  applyAgain(): void;
  toggleChanges(): void;
  dismiss(): void;
  runWhole(): void;
}) {
  const { banner } = props;
  const refusal = props.refusal ? <p className="flows-refusal" role="alert">Not saved: {props.refusal}</p> : null;
  if (banner.kind === "conflict") {
    return (
      <div className="flows-banner" data-tone="warn" role="alert">
        <p>{conflictWords(banner.conflict)}</p>
        <div className="flows-tool-row">
          <button type="button" className="flows-tool" aria-expanded={banner.showChanges} onClick={props.toggleChanges}>See what changed</button>
          {banner.edit ? <button type="button" className="flows-button" disabled={props.busy} onClick={props.applyAgain}>Apply mine again</button> : null}
          <button type="button" className="flows-tool" onClick={props.dismiss}>Close</button>
        </div>
        {banner.showChanges ? (
          <ul className="flows-changes" aria-label="What changed">
            {banner.conflict.changedBy.map((change) => (
              <li key={change.revisionNumber}>
                Version {change.revisionNumber}: {change.madeByLabel}, {agoText(change.createdAt || undefined, Date.now())}{change.message ? `: ${change.message}` : ""}
              </li>
            ))}
            {banner.conflict.steps.length ? <li>The steps marked “changed” below are the ones it touched.</li> : null}
          </ul>
        ) : null}
        {refusal}
      </div>
    );
  }
  return (
    <div className="flows-banner" data-tone="ok" role="status">
      <p>
        {banner.kind === "saved" ? `Saved as version ${banner.revision}.` : null}
        {banner.kind === "undone" ? `Undone. Saved as version ${banner.revision}.` : null}
        {banner.kind === "restored" ? `Restored version ${banner.from}. Saved as version ${banner.revision}.` : null}
        {" "}It has not run whole since.
      </p>
      <div className="flows-tool-row">
        {banner.kind === "saved" ? <button type="button" className="flows-tool" disabled={props.busy} onClick={props.undo}>Undo</button> : null}
        <button type="button" className="flows-button" onClick={props.runWhole}>Run it whole to test</button>
        <button type="button" className="flows-tool" onClick={props.dismiss}>Close</button>
      </div>
      {refusal}
    </div>
  );
}
