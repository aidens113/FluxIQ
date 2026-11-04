type Project = { id: string; updatedAt: number };

type Projects = {
  listProjects(domainId?: string | null): Promise<{ projects: Project[] }>;
  createProject(input: { name: string; domainId: string }): Promise<Project>;
};

/** What a person's first project is called, when a browser of theirs is the first thing to need one. */
const FIRST_PROJECT_NAME = "My automations";

const creating = new WeakMap<object, Map<string, Promise<Project>>>();

/**
 * The project a paired browser works in when the person has none open in the panel: the one they
 * last worked in, or a first one. A browser's chat has nowhere to be without a project, and there
 * is nothing it could ask them to do about that from there, so it never sits waiting for one.
 */
export async function projectForPairedClient(studio: Projects, domainId: string | null): Promise<string | null> {
  if (domainId === null) return null;
  const { projects } = await studio.listProjects(domainId);
  const latest = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest) return latest.id;
  // A browser polls: two polls must not make two projects.
  const inFlight = creating.get(studio) ?? new Map<string, Promise<Project>>();
  creating.set(studio, inFlight);
  const made = inFlight.get(domainId) ?? studio.createProject({ name: FIRST_PROJECT_NAME, domainId });
  inFlight.set(domainId, made);
  try {
    return (await made).id;
  } finally {
    inFlight.delete(domainId);
  }
}
