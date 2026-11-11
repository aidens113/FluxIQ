"use client";

import type { KeyRow } from "../model";

/**
 * The model keys: pick one to look at, make one the default, offer one's own
 * to the workspace, or start removing one. Without `onDefault` (a person who
 * does not choose the workspace's default) there is no control to make one the
 * default: the default row only says so. "Offer to the workspace" is shown
 * only on the person's own keys: nobody offers another person's key.
 */
export function KeyList(props: {
  rows: readonly KeyRow[];
  selectedId: string;
  busy: boolean;
  onSelect(keyId: string): void;
  onDefault?: ((keyId: string) => void) | undefined;
  onOffer?: ((keyId: string, offered: boolean) => void) | undefined;
  onRemove(keyId: string): void;
}) {
  const { onOffer } = props;
  const { onDefault } = props;
  if (props.rows.length === 0) return <p>You have not added an AI key yet. Add one below and the assistant will use it.</p>;
  return (
    <fieldset className="settings-keys">
      <legend>{onDefault ? "Your AI keys. The default key is the one the assistant and new Flows use." : "Your AI keys."}</legend>
      <ul>
        {props.rows.map((row) => (
          <li key={row.id} data-selected={row.id === props.selectedId} data-default={row.isDefault}>
            {onDefault ? (
              <label className="settings-key-default">
                <input type="radio" name="default-key" checked={row.isDefault} disabled={props.busy || row.status === "Off"} onChange={() => onDefault(row.id)} aria-label={`Make ${row.name} the default key`} />
                <span>Default</span>
              </label>
            ) : (
              <span className="settings-key-default">{row.isDefault ? "Default" : ""}</span>
            )}
            <button type="button" className="settings-key-name" aria-pressed={row.id === props.selectedId} onClick={() => props.onSelect(row.id)}>{row.name}</button>
            <span className="settings-key-facts">{row.provider} · {row.status}{row.lastUsed ? ` · last used ${row.lastUsed}` : ""}</span>
            {onOffer && row.heldByYou ? (
              <label className="settings-key-offer">
                <input type="checkbox" checked={row.offered} disabled={props.busy || (row.status === "Off" && !row.offered)} onChange={(event) => onOffer(row.id, event.target.checked)} aria-label={`Offer ${row.name} to the workspace`} />
                <span>Offer to the workspace</span>
              </label>
            ) : !row.heldByYou && row.offered ? <span className="settings-key-offer">Offered to the workspace</span> : null}
            <button type="button" disabled={props.busy} onClick={() => props.onRemove(row.id)} aria-label={`Remove ${row.name}`}>Remove</button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
