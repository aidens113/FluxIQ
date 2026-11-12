import { agoText } from "../../home/model";
import { ConfirmButton } from "../confirm";
import type { ChangeResult } from "../data";
import type { PairedClientRow } from "../model";

/** Browsers paired with this FluxIQ. Only a browser still trusted can be forgotten. */
export function PairedClientsList(props: { rows: PairedClientRow[]; now: number; onForget: (trustedClientId: string) => Promise<ChangeResult>; onDone: () => void }) {
  if (props.rows.length === 0) return <p className="security-note">No browsers are paired. A browser you pair shows up here.</p>;
  return (
    <ul className="security-list" aria-label="Paired browsers">
      {props.rows.map((row) => (
        <li key={row.trustedClientId} className="security-row">
          <span className="security-title">{row.name}</span>
          <span className="security-muted">{row.clientType} · {row.status} · paired {agoText(row.approvedAt, props.now)} · last used {agoText(row.lastUsedAt, props.now)}</span>
          {row.status === "active" ? (
            <ConfirmButton label="Forget" question={`Forget ${row.name}? It will have to pair again.`} confirmLabel="Forget" onConfirm={() => props.onForget(row.trustedClientId)} onDone={props.onDone} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
