"use client";

import { useEffect, useState } from "react";
import type { ModelKeyHostAction } from "@fluxiq/ui-components";
import { ModelKeyCardView, type PanelModelKeysPort } from "../../model-keys";
import type { SettingsData } from "../data";
import { keyRows, type KeyRow } from "../model";
import { KeyList } from "./KeyList";
import { RemoveKeyConfirm } from "./RemoveKeyConfirm";
import { ReplaceKeyForm } from "./ReplaceKeyForm";
import { useLiveDefaultNotice } from "./use-live-default-notice";

const when = (ms: number) => new Date(ms).toLocaleString();
const UPDATE_NOTE = "Ask whoever runs this FluxIQ to update it, then open it again.";

/**
 * Settings > AI keys (`#ai-keys`): one box holding the shared key card with Core's real state, its notes, and the
 * person's keys. Every key is added through the card ("Add a key", then "Add another key"), never a second form.
 * `port` is the one the card works through; `sharing` is whether the workspace has more than one person, which is
 * the only time "Offer to the workspace" and the workspace's key are shown.
 */
export function AiKeysSection(props: { data: SettingsData; port: PanelModelKeysPort; sharing: boolean; selectedId: string; onSelect(keyId: string): void }) {
  const { data, port } = props;
  const [removing, setRemoving] = useState("");
  const [replacing, setReplacing] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // A key changed through the card is a key changed here too.
  const { reload } = data;
  useEffect(() => port.onChange(() => void reload()), [port, reload]);
  // A person who does not choose the workspace's default is shown it only on the key the server names, never a stand-in.
  const choosesDefault = data.choices.mayChoose !== false;
  const rows = keyRows(data.keys, data.choices.defaultKeyId, when).map((row) => (choosesDefault || row.id === data.choices.defaultKeyId ? row : { ...row, isDefault: false }));
  const removeTarget = rows.find((row) => row.id === removing);
  const replaceTarget = rows.find((row) => row.id === replacing);
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
  function startChange(change: "remove" | "replace", keyId: string) {
    setStatus("");
    setRemoving(change === "remove" ? keyId : "");
    setReplacing(change === "replace" ? keyId : "");
  }
  function onCardAction(action: ModelKeyHostAction) {
    if (action === "change-model") {
      const target = document.getElementById("assistant-model");
      target?.scrollIntoView({ block: "start" });
      target?.querySelector("select")?.focus();
    } else if (action === "try-now") port.notify();
    else if (action === "how-to-update") setStatus(UPDATE_NOTE);
  }
  const notice = useLiveDefaultNotice(data.choices.defaultNotice, data.keys, data.choices.defaultKeyId);
  return (
    <section id="ai-keys" aria-labelledby="settings-ai-keys">
      <h2 id="settings-ai-keys">AI keys</h2>
      <p>FluxIQ uses an AI key to understand and build what you ask. It keeps the key and never shows it again.</p>
      <div className="settings-keybox">
        <ModelKeyCardView port={port} variant="full" onAction={onCardAction} />
        {notice ? <p role="status" className="settings-keybox-note" data-tone="warn">{notice}</p> : null}
        {choosesDefault ? null : <p className="settings-keybox-note">This workspace&rsquo;s owner chooses its default key.</p>}
        {props.sharing ? <p className="settings-keybox-note">Your keys pay only for your own messages. Offer one to the workspace to let it pay for other people&rsquo;s too, once an owner or administrator chooses it as the workspace&rsquo;s key.</p> : null}
        <KeyList
          rows={rows}
          selectedId={props.selectedId}
          busy={busy}
          onSelect={props.onSelect}
          onDefault={choosesDefault ? (id) => void makeDefault(id) : undefined}
          onOffer={props.sharing ? (id, offered) => void offer(id, offered) : undefined}
          onReplace={(id) => startChange("replace", id)}
          onRemove={(id) => startChange("remove", id)}
        />
        {props.sharing && choosesDefault ? <WorkspaceKeyLine data={data} rows={rows} busy={busy} onChoose={(id) => void makeDefault(id, "Chosen as the workspace’s key.")} /> : null}
        {replaceTarget ? (
          <ReplaceKeyForm
            key={replaceTarget.id}
            keyName={replaceTarget.name}
            onReplace={async (value) => {
              const failure = await data.replace(replaceTarget.id, value);
              if (!failure) {
                setStatus(`Replaced ${replaceTarget.name}.`);
                port.notify();
              }
              return failure;
            }}
            onDone={() => setReplacing("")}
            onCancel={() => setReplacing("")}
          />
        ) : null}
        {removeTarget ? (
          <RemoveKeyConfirm
            key={removeTarget.id}
            keyName={removeTarget.name}
            onCancel={() => setRemoving("")}
            onRemove={async () => {
              const outcome = await data.remove(removeTarget.id);
              if (outcome.kind === "removed") {
                setRemoving("");
                setStatus(`Removed ${removeTarget.name}.`);
                port.notify();
              }
              return outcome;
            }}
          />
        ) : null}
      </div>
      <p role="status" className="settings-saved">{status}</p>
    </section>
  );
}

/**
 * For a person who chooses the workspace's keys: whether the key in use pays for other people's messages. It does
 * only once it is chosen as the workspace's key and its holder offered it; nothing is shared automatically.
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
        {choices.assistantKeyId === null ? <button type="button" className="button" disabled={props.busy} onClick={() => props.onChoose(usedId)}>Choose {name} as the workspace&rsquo;s key</button> : null}
      </p>
    );
  }
  if (choices.assistantKeyOffered !== true) return <p className="settings-workspace-key">{name} is the workspace&rsquo;s key, but the person who added it has not offered it to the workspace, so it pays only for their own messages.</p>;
  return <p className="settings-workspace-key">{name} is the workspace&rsquo;s key and pays for everyone&rsquo;s messages.</p>;
}
