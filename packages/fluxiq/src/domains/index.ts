import type { JsonObject } from "../core";

export type DomainStatus = "available" | "preview" | "disabled";

export type DomainManifest = {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  status?: DomainStatus;
  capabilities?: string[];
  inputs?: DomainInputDefinition[];
  outputs?: DomainOutputDefinition[];
  metadata?: JsonObject;
};

export type DomainInputDefinition = {
  id: string;
  title: string;
  description?: string;
  schema?: JsonObject;
  metadata?: JsonObject;
};

export type DomainOutputDefinition = {
  id: string;
  title: string;
  description?: string;
  schema?: JsonObject;
  effects?: string[];
  metadata?: JsonObject;
};

export type DomainRegistration = {
  manifest: DomainManifest;
  componentPacks?: string[];
  programExtensions?: string[];
};

export type DomainSummary = Omit<DomainManifest, "metadata"> & {
  route: string;
  status: DomainStatus;
};

export class DomainRegistry {
  private readonly domains = new Map<string, DomainRegistration>();

  register(registration: DomainRegistration): void {
    const id = normalizeDomainId(registration.manifest.id);
    if (!id) {
      throw new Error("Domain id is required");
    }
    if (this.domains.has(id)) {
      throw new Error(`Duplicate domain registration: ${id}`);
    }
    this.domains.set(id, {
      ...registration,
      manifest: { ...registration.manifest, id }
    });
  }

  all(): DomainRegistration[] {
    return [...this.domains.values()].sort((left, right) =>
      left.manifest.title.localeCompare(right.manifest.title)
    );
  }

  maybeGet(domainId: string | null | undefined): DomainRegistration | null {
    if (!domainId) return null;
    return this.domains.get(normalizeDomainId(domainId)) ?? null;
  }

  summaries(): DomainSummary[] {
    return this.all().map((registration) => domainSummary(registration.manifest));
  }
}

export function domainSummary(manifest: DomainManifest): DomainSummary {
  const id = normalizeDomainId(manifest.id);
  const summary: DomainSummary = {
    id,
    title: manifest.title,
    category: manifest.category,
    description: manifest.description,
    icon: manifest.icon,
    status: manifest.status ?? "available",
    route: `/domains/${id}`
  };
  if (manifest.capabilities) {
    summary.capabilities = manifest.capabilities;
  }
  return summary;
}

export function normalizeDomainId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}
