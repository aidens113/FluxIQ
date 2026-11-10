"use client";

import { ENGINE_TOOLS, engineToolHref } from "../model";

/** Advanced, closed until opened: the engine's own pages, unchanged. */
export function EngineToolsSection() {
  return (
    <details className="settings-advanced">
      <summary>Advanced</summary>
      <h2 id="settings-engine-tools">Engine tools</h2>
      <p>The engine&rsquo;s own pages, for when you need to look under the hood. You never need them to build or run a Flow.</p>
      <ul aria-labelledby="settings-engine-tools">
        {ENGINE_TOOLS.map((tool) => <li key={tool.programId}><a href={engineToolHref(tool)}>{tool.name}</a> <span>{tool.explanation}</span></li>)}
      </ul>
    </details>
  );
}
