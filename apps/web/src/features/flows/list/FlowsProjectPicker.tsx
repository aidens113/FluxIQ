"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { createAutomationProject, useProjectList } from "../../automation-studio/project";
import { notifyProjectsChanged, usePanelContext } from "../../panel-shell";

/** What Flows shows before a project is chosen: pick one, or make one, without going to the top bar. */
export function FlowsProjectPicker() {
  const studio = useProgramTransport("automation-studio");
  const { dispatch } = usePanelContext();
  const list = useProjectList();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const choose = (projectId: string) => dispatch({ type: "project", projectId });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const result = await createAutomationProject(studio, { name: trimmed, description: "", categoryId: null, authorizationPin: "" });
      const project = result.ok ? result.payload?.project : undefined;
      if (!project) return setFailure(result.error ?? "The project could not be created.");
      notifyProjectsChanged();
      choose(project.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flows-picker" aria-label="Choose a project">
      <p className="flows-note">Choose a project to see its Flows, or start a new one.</p>
      {list.state === "loading" ? <p className="flows-note">Loading the projects…</p> : null}
      {list.state === "error" ? (
        <p className="flows-note flows-error" role="alert">
          The projects could not be loaded: {list.message} <button type="button" onClick={list.reload}>Try again</button>
        </p>
      ) : null}
      {list.state === "ready" && list.projects.length === 0 ? <p className="flows-note">There are no projects yet. Create the first one below.</p> : null}
      {list.state === "ready" && list.projects.length > 0 ? (
        <ul className="flows-rows">
          {list.projects.map((project) => (
            <li key={project.id} className="flows-row">
              <span className="flows-row-name">{project.name}</span>
              <button type="button" className="flows-button" onClick={() => choose(project.id)} aria-label={`Open ${project.name}`}>Open</button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="flows-search" onSubmit={(event) => void create(event)}>
        <label className="flows-search">
          <span>New project</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name the project" />
        </label>
        <div className="flows-tool-row">
          <button type="submit" className="flows-button flows-primary" disabled={busy || !name.trim()}>Create project</button>
          <Link className="flows-button" href="/projects">All projects</Link>
        </div>
        {failure ? <p className="flows-note flows-error" role="alert">{failure}</p> : null}
      </form>
    </section>
  );
}
