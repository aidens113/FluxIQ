"use client";

import { useState } from "react";
import type { SettingsData } from "../data";
import { allowanceWords, parseAllowance } from "../model";

/** What one message to the assistant may spend. */
export function AllowanceSection(props: { data: SettingsData }) {
  const { allowance } = props.data;
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  if (!allowance) return null;
  const shown = text ?? (allowance.chosen ? String(allowance.allowanceUsd) : "");
  async function save() {
    const parsed = parseAllowance(shown);
    if (!parsed.ok) {
      setStatus(parsed.message);
      return;
    }
    const failure = await props.data.saveAllowance(parsed.usd);
    setStatus(failure || "Saved.");
    if (!failure) setText(null);
  }
  async function resetToUsual() {
    setText("");
    const failure = await props.data.saveAllowance(null);
    setStatus(failure || "Back to the usual amount.");
    if (!failure) setText(null);
  }
  return (
    <section aria-labelledby="settings-allowance">
      <h2 id="settings-allowance">Spending per message</h2>
      <p>Each message you send the assistant may use up to {allowanceWords(allowance.allowanceUsd)} of your AI provider&rsquo;s credit. When a message reaches that amount the assistant stops and tells you. {allowance.chosen ? "You chose this amount." : `This is the usual amount, ${allowanceWords(allowance.defaultUsd)}.`}</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}>
        <label>Allowance in dollars<input inputMode="decimal" value={shown} placeholder={allowanceWords(allowance.defaultUsd)} onChange={(event) => setText(event.target.value)} /></label>
        <button type="submit">Save</button>
        <button type="button" onClick={() => void resetToUsual()}>Use the usual amount</button>
      </form>
      <p role="status">{status}</p>
    </section>
  );
}
