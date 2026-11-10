"use client";

import { useState, type FormEvent } from "react";
import { EMPTY_NEW_KEY, NEW_KEY_PROVIDERS, canSaveNewKey, type NewKeyForm } from "../model";

/**
 * Adds a model key. The key is typed once: the box is emptied the moment it is
 * sent and nothing here shows it again. Your password seals it, as it always has.
 */
export function AddKeyForm(props: { onAdd(form: NewKeyForm): Promise<string> }) {
  const [form, setForm] = useState<NewKeyForm>(EMPTY_NEW_KEY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<NewKeyForm>) => setForm((current) => ({ ...current, ...patch }));
  async function submit() {
    const sent = form;
    setPending(true);
    setForm({ ...form, value: "", password: "", pin: "" });
    const failure = await props.onAdd(sent);
    setPending(false);
    setError(failure);
    if (!failure) setForm(EMPTY_NEW_KEY);
    else setForm({ ...sent, value: "", password: "", pin: "" });
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSaveNewKey(form) && !pending) void submit();
  }
  return (
    <form className="settings-add-key" onSubmit={onSubmit}>
      <h3>Add a key</h3>
      <p>Paste the key from your AI provider. It is stored sealed under your password and shown to nobody afterwards, including you. The first key you add becomes your default.</p>
      <label>Name<input value={form.name} onChange={(event) => set({ name: event.target.value })} autoComplete="off" /></label>
      <label>Provider
        <select value={form.provider} onChange={(event) => set({ provider: event.target.value })}>
          {NEW_KEY_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider === "Anthropic" ? "Anthropic (Claude)" : provider}</option>)}
        </select>
      </label>
      <label>Key<input type="password" value={form.value} onChange={(event) => set({ value: event.target.value })} autoComplete="off" /></label>
      <label>Your password<input type="password" value={form.password} onChange={(event) => set({ password: event.target.value })} autoComplete="current-password" /></label>
      {/\bPIN\b/i.test(error) ? <label>Your PIN<input inputMode="numeric" value={form.pin} onChange={(event) => set({ pin: event.target.value.replace(/\D/g, "") })} autoComplete="off" /></label> : null}
      <button type="submit" disabled={!canSaveNewKey(form) || pending}>{pending ? "Saving..." : "Save key"}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
