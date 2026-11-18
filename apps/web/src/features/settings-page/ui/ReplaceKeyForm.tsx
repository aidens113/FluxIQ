"use client";

import { useState, type FormEvent } from "react";

/** Replaces one saved key's value. The new key is typed once, the box is emptied the moment it is sent, and nothing here shows it again. */
export function ReplaceKeyForm(props: { keyName: string; onReplace(value: string, password: string): Promise<string>; onDone(): void; onCancel(): void }) {
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || !password || pending) return;
    const sent = { value, password };
    setPending(true);
    setValue("");
    setPassword("");
    const failure = await props.onReplace(sent.value, sent.password);
    setPending(false);
    setError(failure);
    if (!failure) props.onDone();
  }
  return (
    <form className="settings-replace" aria-label={`Replace ${props.keyName}`} onSubmit={(event) => void submit(event)}>
      <p>Paste the new key for &ldquo;{props.keyName}&rdquo;. It keeps its name and takes the old key&rsquo;s place. FluxIQ keeps the key and never shows it again.</p>
      <label className="field"><span className="field-label">New key</span><input type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      <label className="field"><span className="field-label">Your password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
      {error ? <p role="alert" className="settings-problem">{error}</p> : null}
      <div className="settings-actions">
        <button type="submit" className="button primary" disabled={pending || !value || !password}>{pending ? "Saving..." : "Replace key"}</button>
        <button type="button" className="button" disabled={pending} onClick={props.onCancel}>Cancel</button>
      </div>
    </form>
  );
}
