import { WorkspacePresentationError } from "./failure";
import { BoundWorkspacePresentation } from "./owner";
import type { WorkspacePresentationBinding, WorkspacePresentationInstance, WorkspacePresentationOwner, WorkspacePresentations } from "./model";

type RuntimeBinding = { workspaceId: string; runtimeId: string; profile: WorkspacePresentationBinding["profile"]; owner: WorkspacePresentationOwner };

export function createWorkspacePresentations(options: { now?: () => number } = {}): WorkspacePresentations {
  const instances = new WeakMap<WorkspacePresentationInstance, RuntimeBinding>();
  const workspaces = new Map<string, WorkspacePresentationOwner>();
  let closed = false;
  return {
    bind(input) {
      if (closed) throw new WorkspacePresentationError("stale_runtime");
      if (!input.workspaceId || !input.runtimeId || !input.instance || !["service", "local", "self-hosted"].includes(input.profile)) throw new WorkspacePresentationError("binding_conflict");
      const binding = Object.freeze({ ...input });
      const previous = instances.get(binding.instance);
      if (previous && (previous.workspaceId !== binding.workspaceId || previous.runtimeId !== binding.runtimeId || previous.profile !== binding.profile)) throw new WorkspacePresentationError("binding_conflict");
      if (previous) {
        if (!previous.owner.isCurrent()) throw new WorkspacePresentationError("stale_runtime");
        return previous.owner;
      }
      workspaces.get(binding.workspaceId)?.invalidate();
      const owner: WorkspacePresentationOwner = new BoundWorkspacePresentation(binding, options.now ?? Date.now, () => !closed && workspaces.get(binding.workspaceId) === owner, () => {
        if (workspaces.get(binding.workspaceId) === owner) workspaces.delete(binding.workspaceId);
      });
      instances.set(binding.instance, { workspaceId: binding.workspaceId, runtimeId: binding.runtimeId, profile: binding.profile, owner });
      workspaces.set(binding.workspaceId, owner);
      return owner;
    },
    forInstance(workspaceId, instance) {
      const binding = instances.get(instance);
      return !closed && binding?.workspaceId === workspaceId && binding.owner.isCurrent() ? binding.owner : undefined;
    },
    invalidate(workspaceId, instance) {
      const binding = instances.get(instance);
      if (!binding || binding.workspaceId !== workspaceId) return false;
      const active = binding.owner.isCurrent();
      binding.owner.invalidate();
      return active;
    },
    close() {
      closed = true;
      for (const owner of workspaces.values()) owner.invalidate();
      workspaces.clear();
    }
  };
}
