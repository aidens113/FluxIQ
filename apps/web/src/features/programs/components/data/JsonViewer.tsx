"use client";

import { useState } from "react";
import { InlineNotice } from "../feedback";
import { CodeViewer } from "./CodeViewer";

type JsonPreview = { text: string; truncated: boolean };

function boundedJsonPreview(value: unknown, maxItems = 600, maxDepth = 10): JsonPreview {
  const seen = new WeakSet<object>();
  let itemCount = 0;
  let truncated = false;
  function visit(current: unknown, depth: number): unknown {
    itemCount += 1;
    if (itemCount > maxItems || depth > maxDepth) {
      truncated = true;
      return "[Preview truncated]";
    }
    if (typeof current === "bigint") return current.toString();
    if (typeof current === "function") return "[Function]";
    if (typeof current === "undefined") return "[Undefined]";
    if (!current || typeof current !== "object") return typeof current === "string" && current.length > 2_000 ? `${current.slice(0, 2_000)}...[truncated]` : current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    if (Array.isArray(current)) {
      const limit = Math.min(current.length, 150);
      if (limit < current.length) truncated = true;
      const values = current.slice(0, limit).map((item) => visit(item, depth + 1));
      if (limit < current.length) values.push("[Preview truncated: " + (current.length - limit) + " more items]");
      return values;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    const limit = Math.min(entries.length, 150);
    if (limit < entries.length) truncated = true;
    const objectPreview = Object.fromEntries(entries.slice(0, limit).map(([key, item]) => [key, visit(item, depth + 1)]));
    if (limit < entries.length) objectPreview.__preview__ = "[Preview truncated: " + (entries.length - limit) + " more properties]";
    return objectPreview;
  }
  return { text: JSON.stringify(visit(value, 0), null, 2), truncated };
}

export function JsonViewer(props: { label: string; value: unknown; defaultOpen?: boolean; filename?: string }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const preview = open ? boundedJsonPreview(props.value) : null;
  return (
    <details className="json-viewer" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary><span>{props.label}</span><small>{open ? "Hide details" : "View details"}</small></summary>
      {preview ? <>
        {preview.truncated ? <InlineNotice message="This preview is bounded for browser performance. Open a focused payload or server export when the full object is needed." tone="info" /> : null}
        <CodeViewer code={preview.text} {...(props.filename ? { filename: props.filename } : {})} label={props.label} language="json" />
      </> : null}
    </details>
  );
}
