"use client";

import { useState, type FormEvent } from "react";
import { EMPTY_NEW_KEY, NEW_KEY_PROVIDERS, canSaveNewKey, type NewKeyForm } from "../model";

/**
 * Adds another AI key (the first is added in the card above). The key is typed once: the box is emptied the moment
 * it is sent and nothing here shows it again.
 */
export function AddKeyForm(props: { onAdd(form: NewKeyForm): Promise<string> }) {
  const [form, setForm] = useState<NewKeyForm>(EMPTY_NEW_KEY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<NewKeyForm>) => setForm((current) => ({ ...current, ...patch }));
  async function submit() {
    const sent = form;
    setPending(true);
    setForm({ ...form, value: "", password: "" });
    const failure = await props.onAdd(sent);
    setPending(false);
    setError(failure);
    setForm(failure ? { ...sent, value: "", password: "" } : EMPTY_NEW_KEY);
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSaveNewKey(form) && !pending) void submit();
  }
  return (
    <form className="settings-add-key" onSubmit={onSubmit}>
      <p>Paste the key from your AI provider. FluxIQ keeps the key and never shows it again.</p>
      <label className="field"><span className="field-label">Name</span><input value={form.name} onChange={(event) => set({ name: event.target.value })} autoComplete="off" /></label>
      <label className="field"><span className="field-label">Provider</span>
        <select value={form.provider} onChange={(event) => set({ provider: event.target.value })}>
          {NEW_KEY_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider === "Anthropic" ? "Anthropic (Claude)" : provider}</option>)}
        </select>
      </label>
      <label className="field"><span className="field-label">Key</span><input type="password" value={form.value} onChange={(event) => set({ value: event.target.value })} autoComplete="off" spellCheck={false} /></label>
      <label className="field"><span className="field-label">Your password</span><input type="password" value={form.password} onChange={(event) => set({ password: event.target.value })} autoComplete="current-password" /></label>
      <button type="submit" className="button primary" disabled={!canSaveNewKey(form) || pending}>{pending ? "Saving..." : "Save key"}</button>
      {error ? <p role="alert" className="settings-problem">{error}</p> : null}
    </form>
  );
}
