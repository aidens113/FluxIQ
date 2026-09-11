"use client";

import { Copy, Download, WrapText } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../controls";
import { notifyGlobalAlert } from "../feedback";
import { Toolbar, Tooltip } from "../layout";

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CodeViewer(props: { label: string; code: string; language?: string; filename?: string }) {
  const [wrap, setWrap] = useState(false);
  const [query, setQuery] = useState("");
  const matchCount = query ? props.code.toLowerCase().split(query.toLowerCase()).length - 1 : 0;
  return (
    <section className="code-viewer">
      <Toolbar label={`${props.label} tools`}>
        <strong>{props.label}</strong>
        <label className="code-viewer-search"><span className="visually-hidden">Find in {props.label}</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Find" type="search" value={query} /></label>
        {query ? <span className="code-viewer-matches">{matchCount} matches</span> : null}
        <Tooltip content={wrap ? "Use horizontal scrolling" : "Wrap long lines"}><IconButton aria-pressed={wrap} label="Toggle line wrapping" onClick={() => setWrap((current) => !current)}><WrapText aria-hidden size={14} /></IconButton></Tooltip>
        <Tooltip content="Copy visible source"><IconButton label="Copy source" onClick={() => {
          void navigator.clipboard?.writeText(props.code)
            .then(() => notifyGlobalAlert({ id: `copy:${props.label}`, tone: "success", message: `${props.label} copied.` }))
            .catch(() => notifyGlobalAlert({ id: `copy:${props.label}`, tone: "error", message: `${props.label} could not be copied.` }));
        }}><Copy aria-hidden size={14} /></IconButton></Tooltip>
        {props.filename ? <Tooltip content={`Download ${props.filename}`}><IconButton label="Download source" onClick={() => {
          try {
            downloadText(props.filename!, props.code);
            notifyGlobalAlert({ id: `download:${props.filename}`, tone: "success", message: `${props.filename} download started.` });
          } catch {
            notifyGlobalAlert({ id: `download:${props.filename}`, tone: "error", message: `${props.filename} could not be downloaded.` });
          }
        }}><Download aria-hidden size={14} /></IconButton></Tooltip> : null}
      </Toolbar>
      <pre className={wrap ? "wrap" : ""} data-language={props.language}><code>{props.code}</code></pre>
    </section>
  );
}
