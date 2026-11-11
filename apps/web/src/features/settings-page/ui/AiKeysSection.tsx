"use client";

import { useState } from "react";
import type { SettingsData } from "../data";
import { keyRows, type NewKeyForm } from "../model";
import { AddKeyForm } from "./AddKeyForm";
import { KeyList } from "./KeyList";
import { RemoveKeyConfirm } from "./RemoveKeyConfirm";

const when = (ms: number) => new Date(ms).toLocaleString();

export function AiKeysSection(props: { data: SettingsData; selectedId: string; onSelect(keyId: string): void }) {
  const { data } = props;
  const [removing, setRemoving] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // A person who does not choose the workspace's default is shown it only on the key the server names, never a stand-in.
  const choosesDefault = data.choices.mayChoose !== false;
  const rows = keyRows(data.keys, data.choices.defaultKeyId, when).map((row) => (choosesDefault || row.id === data.choices.defaultKeyId ? row : { ...row, isDefault: false }));
  const target = rows.find((row) => row.id === removing);
  async function makeDefault(keyId: string) {
    setBusy(true);
    const failure = await data.setDefault(keyId);
    setBusy(false);
    setStatus(failure || "Default key changed.");
  }
  function startRemoving(keyId: string) {
    setStatus("");
    setRemoving(keyId);
  }
  async function addKey(form: NewKeyForm): Promise<string> {
    const failure = await data.addKey(form);
    if (!failure) setStatus(`Added ${form.name.trim()}.`);
    return failure;
  }
  return (
    <section aria-labelledby="settings-ai-keys">
      <h2 id="settings-ai-keys">AI keys</h2>
      {choosesDefault
        ? <p>The assistant and your Flows use an AI provider through a key you add here. By default they use the first key you added; pick another below any time.</p>
        : <p>The assistant and your Flows use an AI provider through a key. Add your own keys here; this workspace&rsquo;s owner chooses its default key.</p>}
      {data.choices.defaultNotice ? <p role="status" className="settings-notice">{data.choices.defaultNotice.message}</p> : null}
      <KeyList rows={rows} selectedId={props.selectedId} busy={busy} onSelect={props.onSelect} onDefault={choosesDefault ? (id) => void makeDefault(id) : undefined} onRemove={startRemoving} />
      {target ? (
        <RemoveKeyConfirm
          key={target.id}
          keyName={target.name}
          onCancel={() => setRemoving("")}
          onRemove={async (proof) => {
            const outcome = await data.remove(target.id, proof);
            if (outcome.kind === "removed") {
              setRemoving("");
              setStatus(`Removed ${target.name}.`);
            }
            return outcome;
          }}
        />
      ) : null}
      <p role="status">{status}</p>
      <AddKeyForm onAdd={addKey} />
    </section>
  );
}
