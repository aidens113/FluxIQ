"use client";

import { useState } from "react";
import type { SettingsData } from "../data";
import { keyRows, type KeyRow, type NewKeyForm } from "../model";
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
  async function makeDefault(keyId: string, done = "Default key changed.") {
    setBusy(true);
    const failure = await data.setDefault(keyId);
    setBusy(false);
    setStatus(failure || done);
  }
  async function offer(keyId: string, offered: boolean) {
    setBusy(true);
    const failure = await data.offer(keyId, offered);
    setBusy(false);
    setStatus(failure || (offered ? "Offered to the workspace." : "No longer offered to the workspace."));
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
      <p>Your keys pay only for your own messages. Offer one to the workspace to let it pay for other people&rsquo;s too, once an owner or administrator chooses it as the workspace&rsquo;s key.</p>
      <KeyList rows={rows} selectedId={props.selectedId} busy={busy} onSelect={props.onSelect} onDefault={choosesDefault ? (id) => void makeDefault(id) : undefined} onOffer={(id, offered) => void offer(id, offered)} onRemove={startRemoving} />
      {choosesDefault ? <WorkspaceKeyLine data={data} rows={rows} busy={busy} onChoose={(id) => void makeDefault(id, "Chosen as the workspace’s key.")} /> : null}
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

/**
 * For a person who chooses the workspace's keys: whether the key in use pays
 * for other people's messages. It does only once it is chosen as the
 * workspace's key and its holder offered it; nothing is shared automatically.
 */
function WorkspaceKeyLine(props: { data: SettingsData; rows: readonly KeyRow[]; busy: boolean; onChoose(keyId: string): void }) {
  const { choices } = props.data;
  const usedId = choices.assistantKeyId ?? choices.defaultKeyId ?? props.rows.find((row) => row.isDefault)?.id ?? null;
  if (!usedId) return null;
  const name = props.data.keys.find((key) => key.id === usedId)?.name ?? "The default key";
  if (choices.assistantKeyChosen !== true) {
    return (
      <p className="settings-workspace-key">
        No key is chosen to pay for other people&rsquo;s messages yet.{" "}
        {choices.assistantKeyId === null ? <button type="button" disabled={props.busy} onClick={() => props.onChoose(usedId)}>Choose {name} as the workspace&rsquo;s key</button> : null}
      </p>
    );
  }
  if (choices.assistantKeyOffered !== true) return <p className="settings-workspace-key">{name} is the workspace&rsquo;s key, but the person who added it has not offered it to the workspace, so it pays only for their own messages.</p>;
  return <p className="settings-workspace-key">{name} is the workspace&rsquo;s key and pays for everyone&rsquo;s messages.</p>;
}
