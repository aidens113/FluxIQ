"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ClipboardButton(props: { value: string; label?: string }) {
  const ownerRef = useRef({ value: props.value });
  if (ownerRef.current.value !== props.value) ownerRef.current = { value: props.value };
  const owner = ownerRef.current;
  const mounted = useRef(false);
  const pending = useRef<object | null>(null);
  const [feedback, setFeedback] = useState<{ owner: object; stage: "idle" | "pending" | "copied" | "failed" }>({ owner, stage: "idle" });
  const stage = feedback.owner === owner ? feedback.stage : "idle";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function copy() {
    if (!mounted.current || ownerRef.current !== owner || pending.current === owner || !props.value) return;
    pending.current = owner;
    setFeedback({ owner, stage: "pending" });
    const current = () => mounted.current && ownerRef.current === owner;
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(props.value);
      if (current()) setFeedback({ owner, stage: "copied" });
    } catch {
      if (current()) setFeedback({ owner, stage: "failed" });
    } finally {
      if (pending.current === owner) pending.current = null;
    }
  }

  return <span className="inline-actions">
    <button aria-busy={stage === "pending" || undefined} className="button" disabled={!props.value || stage === "pending"} onClick={() => void copy()} type="button">
      <Copy aria-hidden size={14} />{stage === "copied" ? "Copied" : stage === "pending" ? "Copying..." : props.label ?? "Copy"}
    </button>
    {stage === "copied" ? <span className="visually-hidden" role="status">Copied to clipboard.</span> : null}
    {stage === "failed" ? <small role="alert">Copy failed. Select the value and copy it manually.</small> : null}
  </span>;
}
