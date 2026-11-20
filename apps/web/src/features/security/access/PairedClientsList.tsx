import { agoText } from "../../home/model";
import { ConfirmButton } from "../confirm";
import type { ChangeResult } from "../data";
import type { PairedClientRow } from "../model";

/** "9 Nov", or "an unknown date". */
function dayText(at: number | undefined): string {
  return at === undefined ? "an unknown date" : new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One line for a browser or app: its name, when it was paired and when it last connected. */
function deviceLine(row: PairedClientRow, now: number): string {
  return `${row.name} · paired ${dayText(row.approvedAt)} · last used ${agoText(row.lastUsedAt, now)}`;
}

/**
 * The browsers and apps that can use this FluxIQ, one row each with "Remove
 * access". Ones already removed are folded under "Removed (n)" and offer
 * nothing: a removed browser asks to be approved again when it connects.
 */
export function PairedClientsList(props: { rows: PairedClientRow[]; now: number; onForget: (trustedClientId: string) => Promise<ChangeResult>; onDone: () => void }) {
  const connected = props.rows.filter((row) => row.status !== "revoked");
  const removed = props.rows.filter((row) => row.status === "revoked");
  return (
    <>
      {connected.length === 0 ? <p className="security-note">No browsers or apps are connected yet.</p> : (
        <ul className="security-list" aria-label="Connected browsers and apps">
          {connected.map((row) => (
            <li key={row.trustedClientId} className="security-row">
              <span className="security-title">{deviceLine(row, props.now)}</span>
              <ConfirmButton label="Remove access" question={`Remove access for ${row.name}? It will have to ask to connect again.`} confirmLabel="Remove access" onConfirm={() => props.onForget(row.trustedClientId)} onDone={props.onDone} />
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 ? (
        <details className="security-removed">
          <summary>{`Removed (${removed.length})`}</summary>
          <ul className="security-list" aria-label="Removed browsers and apps">
            {removed.map((row) => <li key={row.trustedClientId} className="security-row"><span className="security-muted">{row.name} · paired {dayText(row.approvedAt)} · removed</span></li>)}
          </ul>
        </details>
      ) : null}
    </>
  );
}
