"use client";

import type { KeyRow } from "../model";

/** The model keys: pick one to look at, make one the default, or start removing one. */
export function KeyList(props: {
  rows: readonly KeyRow[];
  selectedId: string;
  busy: boolean;
  onSelect(keyId: string): void;
  onDefault(keyId: string): void;
  onRemove(keyId: string): void;
}) {
  if (props.rows.length === 0) return <p>You have not added an AI key yet. Add one below and the assistant will use it.</p>;
  return (
    <fieldset className="settings-keys">
      <legend>Your AI keys. The default key is the one the assistant and new Flows use.</legend>
      <ul>
        {props.rows.map((row) => (
          <li key={row.id} data-selected={row.id === props.selectedId} data-default={row.isDefault}>
            <label className="settings-key-default">
              <input type="radio" name="default-key" checked={row.isDefault} disabled={props.busy || row.status === "Off"} onChange={() => props.onDefault(row.id)} aria-label={`Make ${row.name} the default key`} />
              <span>Default</span>
            </label>
            <button type="button" className="settings-key-name" aria-pressed={row.id === props.selectedId} onClick={() => props.onSelect(row.id)}>{row.name}</button>
            <span className="settings-key-facts">{row.provider} · {row.status}{row.lastUsed ? ` · last used ${row.lastUsed}` : ""}</span>
            <button type="button" disabled={props.busy} onClick={() => props.onRemove(row.id)} aria-label={`Remove ${row.name}`}>Remove</button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
