"use client";

import { usePanelContext } from "../context";
import { useProjectChoices } from "./use-project-choices";

export function ProjectSwitcher() {
  const { context, dispatch } = usePanelContext();
  const { projects, failed } = useProjectChoices();
  return (
    <label className="panel-project">
      <span className="panel-project-label">Project</span>
      <select
        aria-label="Project"
        value={context.projectId ?? ""}
        onChange={(event) => dispatch({ type: "project", projectId: event.target.value || undefined })}
      >
        <option value="">{failed ? "Projects could not be loaded" : "All projects"}</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  );
}
