"use client";

import { ENGINE_TOOLS, type EngineTool } from "../model";

/** Advanced, closed until opened: the engine's own tools, each on a page of its own. `tools` is what the deployment's panel preset lists (all of them by default). */
export function EngineToolsSection(props: { tools?: readonly EngineTool[] }) {
  const tools = props.tools ?? ENGINE_TOOLS;
  return (
    <details className="settings-advanced">
      <summary>Advanced</summary>
      <h2 id="settings-engine-tools">Engine tools</h2>
      <p>The engine&rsquo;s own tools, for when you need to look under the hood. You never need them to build or run a Flow.</p>
      <ul aria-labelledby="settings-engine-tools">
        {tools.map((tool) => <li key={tool.id}><a href={tool.href}>{tool.name}</a> <span>{tool.explanation}</span></li>)}
      </ul>
    </details>
  );
}
