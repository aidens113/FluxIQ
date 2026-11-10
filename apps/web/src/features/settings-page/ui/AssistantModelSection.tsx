"use client";

import { useState } from "react";
import type { SettingsData } from "../data";
import { assistantChoice } from "../model";

/** "The assistant uses [key] [model]": the key and model behind the chat on the right. */
export function AssistantModelSection(props: { data: SettingsData }) {
  const { data } = props;
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const choice = assistantChoice(data.keys, data.choices);
  async function save(pick: { keyId: string; model: string }) {
    setBusy(true);
    const failure = await data.saveAssistant(pick);
    setBusy(false);
    setStatus(failure || "Saved.");
  }
  return (
    <section aria-labelledby="settings-assistant">
      <h2 id="settings-assistant">The assistant</h2>
      {choice.keys.length === 0 ? <p>Add an AI key above to turn the assistant on.</p> : (
        <div className="settings-assistant-row">
          <span>The assistant uses</span>
          <label>Key
            <select value={choice.keyId} disabled={busy} onChange={(event) => void save({ keyId: event.target.value, model: "" })}>
              <option value="">The default key{choice.effectiveKey && !choice.keyId ? ` (${choice.effectiveKey.name})` : ""}</option>
              {choice.keys.map((key) => <option key={key.id} value={key.id}>{key.name}</option>)}
            </select>
          </label>
          <label>Model
            <select value={choice.model} disabled={busy || choice.models.length === 0} onChange={(event) => void save({ keyId: choice.keyId, model: event.target.value })}>
              <option value="">The provider&rsquo;s usual model</option>
              {choice.models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
        </div>
      )}
      <p>The key says who you pay and whose account the assistant uses. The model is the AI that answers; the usual model is a good choice unless you want a cheaper or a stronger one. Your Flows pick their own model and are not changed here.</p>
      <p role="status">{status}</p>
    </section>
  );
}
