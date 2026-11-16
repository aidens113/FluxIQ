"use client";

import { useState } from "react";

/** One value a person copies into a client, with a button that copies it. */
export function CopyField(props: { label: string; value: string | undefined; multiline?: boolean; missing: string }) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const value = props.value;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value ?? "");
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  }
  return (
    <div className="settings-copy">
      <span className="settings-copy-label">{props.label}</span>
      {value ? (props.multiline ? <pre className="settings-copy-value">{value}</pre> : <code className="settings-copy-value">{value}</code>) : <span className="settings-copy-value">{props.missing}</span>}
      <button type="button" disabled={!value} onClick={() => void copy()} aria-label={`Copy ${props.label}`}>Copy</button>
      {copied === "yes" ? <span role="status">Copied.</span> : null}
      {copied === "no" ? <span role="alert">Could not copy. Select the text and copy it yourself.</span> : null}
    </div>
  );
}
