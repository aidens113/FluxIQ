import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../api-contracts/automation.ts";

// The project a person works in when they have none open: the latest one that is theirs, by the
// owner the registry recorded. Never someone else's, however recent. An old project nobody claimed
// belongs to the default administrator, so anyone else gets a new one of theirs.
//
// A paired browser asks in its own domain, and one paired without a domain gets none. The panel's
// chat asks in the domain its page is scoped to; a panel page scoped to no domain says so
// (`unscoped`), and then reads exactly the projects the panel's own project list reads.
//
// Reading makes nothing. Only `create` makes a first one, through the registry, so its permission
// check runs and its owner is recorded; the caller for that is a write route, never a read.

/** What a person's first project is called, when the first thing to need one is a chat of theirs. */
const FIRST_PROJECT_NAME = "My automations";

type OwnedProject = { id: string; updatedAt: number; ownerUserId?: string | null };

type PersonProjectInput = {
  registry: GlobalProgramApiRegistry;
  actor: ProgramApiActor;
  domainId: string | null;
  create?: boolean;
  /** The panel, on a page scoped to no domain: a null `domainId` reads the panel's own unscoped list instead of answering none. */
  unscoped?: boolean;
};

// A browser asks again while waiting: two asks must not make two projects.
const creating = new WeakMap<GlobalProgramApiRegistry, Map<string, Promise<string | null>>>();

async function latestOwn({ registry, actor, domainId }: PersonProjectInput): Promise<string | null> {
  const listed = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects, scope: { domainId }, actor, payload: {} });
  const projects = listed.ok ? (listed.payload as { projects?: OwnedProject[] } | undefined)?.projects ?? [] : [];
  const own = projects.filter((project) => project.ownerUserId === actor.userId);
  return own.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null;
}

async function makeFirst({ registry, actor, domainId }: PersonProjectInput): Promise<string | null> {
  const made = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProject, scope: { domainId }, actor, payload: { name: FIRST_PROJECT_NAME } });
  return made.ok ? (made.payload as { project?: { id?: string } } | undefined)?.project?.id ?? null : null;
}

async function ownOrFirst(input: PersonProjectInput): Promise<string | null> {
  return await latestOwn(input) ?? await makeFirst(input);
}

/** This person's latest own project in the domain, or null; with `create`, a first one when they have none and the registry allows it. */
export async function automationStudioPersonProject(input: PersonProjectInput): Promise<string | null> {
  const { domainId, registry, actor } = input;
  if (domainId === null && input.unscoped !== true) return null;
  if (!input.create) return latestOwn(input);
  const running = creating.get(registry) ?? new Map<string, Promise<string | null>>();
  creating.set(registry, running);
  const key = JSON.stringify([actor.userId, domainId]);
  const asked = running.get(key) ?? ownOrFirst(input);
  running.set(key, asked);
  try {
    return await asked;
  } finally {
    running.delete(key);
  }
}
